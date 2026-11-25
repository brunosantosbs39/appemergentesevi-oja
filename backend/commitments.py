"""A public vacancy owns capacity; each accepted worker owns a separate service."""
from copy import deepcopy
from datetime import datetime
import os
from uuid import uuid4
from fastapi import HTTPException
from pymongo import ReturnDocument
try:
    from backend.service_funds import change_balance, entry
except ModuleNotFoundError:
    from service_funds import change_balance, entry


async def approve(db, query, changes, gross, net, timestamp):
    async def accept(session):
        parent = await db.requests.find_one(query, session=session)
        if not parent or parent.get('filled_slots', 0) >= parent.get('worker_count', 1):
            raise HTTPException(409, 'Esta vaga foi preenchida ou a candidatura mudou. Atualize os pedidos.')
        child = deepcopy(parent)
        for key in ('_id', 'staffing_version', 'worker_count', 'filled_slots', 'applications', 'alert_job', 'last_cancellation'):
            child.pop(key, None)
        child.update({k: v for k, v in changes.items() if not k.startswith('applications.')})
        child.update(id=str(uuid4()), parent_request_id=parent['id'], created_at=timestamp)
        if parent.get('wallet_reservation'):
            if gross <= 0 or not 0 <= net <= gross:
                raise HTTPException(409, 'Combine o valor antes de aprovar a candidatura.')
            if await db.pix_deposits.find_one({'user_id':parent['client_id'], 'status':'review',
                    'credited_cents':{'$exists':True}}, session=session):
                raise HTTPException(409, 'Aguarde a revisão do saldo antes de reservar.')
            fund = {'id':str(uuid4()), 'request_id':child['id'], 'gross':gross, 'net':net, 'status':'reserved'}
            child['service_fund'] = fund
            await change_balance(db, parent['client_id'], -gross, session)
            await entry(db, fund, 'service_reserve', parent['client_id'], -gross, timestamp, session)
        count = parent.get('filled_slots', 0) + 1
        result = await db.requests.find_one_and_update(query, {'$set':{
            'staffing_version':1, 'worker_count':parent.get('worker_count',1),
            'filled_slots':count, 'status':'preenchido' if count == parent.get('worker_count',1) else 'pendente',
            'updated_at':timestamp, 'applications.$.status':'approved',
            'applications.$.responded_at':timestamp, 'applications.$.commitment_id':child['id']}},
            projection={'_id':0}, return_document=ReturnDocument.AFTER, session=session)
        if not result:
            raise HTTPException(409, 'A candidatura mudou. Atualize os pedidos.')
        await db.requests.insert_one(child, session=session)
        return result
    async with await db.client.start_session() as session:
        return await session.with_transaction(accept)


async def reopen(db, child, timestamp, session):
    """Called only in the transaction that cancels a previously active commitment."""
    if not child.get('parent_request_id'):
        return
    await db.requests.update_one({'id':child['parent_request_id'], 'status':{'$in':['pendente','preenchido']},
        'filled_slots':{'$gt':0}, 'applications.commitment_id':child['id']},
        {'$inc':{'filled_slots':-1}, '$set':{'status':'pendente', 'updated_at':timestamp,
            'applications.$.status':'withdrawn'}}, session=session)


async def cancel(db, rid, uid, reason, timestamp):
    if len(reason.strip()) < 5:
        raise HTTPException(422, 'Informe o motivo com pelo menos 5 caracteres.')
    async def finish(session):
        selected = await db.requests.find_one({'id':rid, '$or':[{'client_id':uid},{'professional_id':uid}]}, session=session)
        if not selected:
            raise HTTPException(404, 'Compromisso não encontrado.')
        owner = selected['client_id'] == uid
        parent_id = selected.get('parent_request_id', rid)
        parent = await db.requests.find_one({'id':parent_id, 'staffing_version':1}, session=session)
        if not parent:
            raise HTTPException(409, 'Atualize os pedidos antes de cancelar.')
        if selected['status'] == 'cancelado':
            selected.pop('_id', None)
            return selected
        if owner:
            if parent['status'] not in ('pendente', 'preenchido'):
                raise HTTPException(409, 'Esta vaga já foi encerrada.')
            if await db.requests.find_one({'parent_request_id':parent_id, 'status':'em_andamento'}, session=session):
                raise HTTPException(409, 'Há um serviço em andamento. Finalize-o antes de excluir a vaga.')
            children = await db.requests.find({'parent_request_id':parent_id, 'status':'aceito'}, session=session).to_list(100)
            cancellation = {'by':uid, 'reason':reason.strip(), 'at':timestamp, 'previous_status':parent['status']}
            await db.requests.update_one({'id':parent_id}, {'$set':{'status':'cancelado', 'deleted_at':timestamp,
                'last_cancellation':cancellation, 'updated_at':timestamp}}, session=session)
        else:
            if selected['status'] != 'aceito' or selected.get('check_in_at'):
                raise HTTPException(409, 'Só é possível cancelar antes do check-in.')
            children = [selected]
        for child in children:
            changes = {'status':'cancelado', 'updated_at':timestamp, 'justified_cancellation':True,
                'last_cancellation':{'by':uid, 'reason':reason.strip(), 'at':timestamp, 'previous_status':child['status']}}
            fund = child.get('service_fund', {})
            if fund.get('status') == 'reserved':
                await change_balance(db, child['client_id'], fund['gross'], session)
                await entry(db, fund, 'service_refund', child['client_id'], fund['gross'], timestamp, session)
                changes['service_fund.status'] = 'refunded'
            await db.requests.update_one({'id':child['id']}, {'$set':changes}, session=session)
            target = child['professional_id'] if owner else child['client_id']
            notice = {'_id':'commitment-cancel:' + child['id'], 'id':str(uuid4()), 'user_id':target,
                'title':'Compromisso cancelado', 'body':'Um compromisso foi cancelado com justificativa. Consulte os detalhes em Pedidos → Compromissos.',
                'url':'/pedidos', 'read':False, 'created_at':timestamp}
            if os.environ.get('VAPID_PRIVATE_KEY'):
                notice['delivery'] = {'state':'ready', 'available_at':datetime.fromisoformat(timestamp), 'attempts':0}
            await db.notifications.insert_one(notice, session=session)
            if not owner:
                await reopen(db, child, timestamp, session)
        return await db.requests.find_one({'id':rid}, {'_id':0}, session=session)
    async with await db.client.start_session() as session:
        return await session.with_transaction(finish)
