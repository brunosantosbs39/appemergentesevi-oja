"""Server-owned attendance deadlines and transactional absence penalties."""
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException
from pymongo import ReturnDocument
try:
    from backend.notifications import send_notice
    from backend.service_funds import change_balance, entry
except ModuleNotFoundError:
    from notifications import send_notice
    from service_funds import change_balance, entry

POLICY = "Tolerância de 15 minutos. Após 1 hora sem check-in, falta automática: bloqueio de candidaturas e publicações por 24 horas na primeira falta e 30 dias a partir da segunda."


def utcnow():
    return datetime.now(timezone.utc)


def schedule(date, time, offset_minutes):
    if not date or not time:
        return {}
    try:
        start = datetime.fromisoformat(date + 'T' + time).replace(tzinfo=timezone(timedelta(minutes=offset_minutes))).astimezone(timezone.utc)
    except ValueError:
        raise HTTPException(422, 'Data ou hora inválida.')
    if start <= utcnow():
        raise HTTPException(422, 'Escolha um horário de serviço no futuro.')
    return {'service_start_at':start.isoformat(), 'attendance_due_at':(start + timedelta(hours=1)).isoformat(), 'attendance_policy_version':1}


def acceptance(request):
    if not request.get('attendance_policy_version'):
        return {}
    start = datetime.fromisoformat(request['service_start_at'])
    if start <= utcnow():
        raise HTTPException(409, 'O horário do serviço já passou. Publique um novo pedido com data e hora atualizadas.')
    return {'attendance_job':{'state':'ready','available_at':max(utcnow(), start-timedelta(minutes=15)), 'attempts':0}}


async def absent(db, rid, moment=None):
    moment = moment or utcnow()
    async def apply(session):
        r = await db.requests.find_one_and_update({'id':rid,'status':'aceito','attendance_policy_version':1,
            'attendance_due_at':{'$lte':moment.isoformat()}, 'check_in_at':None, 'no_show_at':{'$exists':False}},
            {'$set':{'status':'cancelado','no_show_at':moment.isoformat(),'updated_at':moment.isoformat()}},
            return_document=ReturnDocument.AFTER, session=session)
        if not r:
            return None
        uid = r['professional_id']
        user = await db.users.find_one_and_update({'user_id':uid}, {'$inc':{'attendance_absences':1}},
            return_document=ReturnDocument.AFTER, session=session)
        if not user:
            raise HTTPException(409, 'Cadastro do profissional não encontrado.')
        days = 1 if user['attendance_absences'] == 1 else 30
        # Count from the actual deadline, not from a delayed worker execution.
        until = datetime.fromisoformat(r['attendance_due_at']) + timedelta(days=days)
        previous = user.get('attendance_blocked_until')
        if previous:
            until = max(until, datetime.fromisoformat(previous))
        await db.users.update_one({'user_id':uid}, {'$set':{'attendance_blocked_until':until.isoformat()}}, session=session)
        await db.attendance_events.insert_one({'_id':rid, 'user_id':uid,'request_id':rid,'kind':'absence',
            'occurred_at':r['attendance_due_at'],'recorded_at':moment.isoformat(),'blocked_until':until.isoformat(),'days':days},session=session)
        fund = r.get('service_fund',{})
        if fund.get('status') == 'reserved':
            await change_balance(db,r['client_id'],fund['gross'],session)
            await entry(db,fund,'service_refund',r['client_id'],fund['gross'],moment.isoformat(),session)
            await db.requests.update_one({'id':rid},{'$set':{'service_fund.status':'refunded'}},session=session)
        # Persist notifications inside the transaction; delivery is handled by the worker.
        import uuid, os
        for target, body in [(uid,f'Falta registrada: 1 hora sem check-in. Bloqueio por {days} dia(s), até {until.isoformat()}. Publicações e candidaturas ficam suspensas.'),
                             (r['client_id'],'O serviço foi cancelado por falta de check-in após 1 hora. Se havia saldo reservado, ele voltou à sua carteira.')]:
            notice={'_id':f'absence:{rid}:{target}','id':str(uuid.uuid4()),'user_id':target,'title':'Falta no serviço','body':body,
                'url':'/pedidos','read':False,'created_at':moment.isoformat()}
            if os.environ.get('VAPID_PRIVATE_KEY'):
                notice['delivery']={'state':'ready','available_at':moment,'attempts':0}
            await db.notifications.insert_one(notice,session=session)
        return r
    async with await db.client.start_session() as session:
        return await session.with_transaction(apply)


async def enforce(db, uid):
    # This check is also run before restricted actions, even if no scheduler ran.
    due = await db.requests.find({'professional_id':uid,'status':'aceito','attendance_policy_version':1,
        'attendance_due_at':{'$lte':utcnow().isoformat()},'check_in_at':None}, {'id':1}).limit(50).to_list(50)
    for r in due:
        await absent(db,r['id'])
    user = await db.users.find_one({'user_id':uid},{'attendance_blocked_until':1})
    until = (user or {}).get('attendance_blocked_until')
    if until and datetime.fromisoformat(until) > utcnow():
        raise HTTPException(403, f'Candidaturas e publicações bloqueadas por falta até {until}. Serviços já aceitos, chat e carteira continuam disponíveis.')


async def attendance_job(db, request):
    current = await db.requests.find_one({'id':request['id']})
    if not current or current['status'] != 'aceito' or current.get('check_in_at'):
        return True, {}
    start = datetime.fromisoformat(current['service_start_at'])
    moment = utcnow()
    if moment >= start + timedelta(hours=1):
        await absent(db,current['id'],moment)
        return True, {}
    late = moment >= start + timedelta(minutes=15)
    stage = 'late' if late else 'reminder'
    if moment >= start - timedelta(minutes=15):
        await send_notice(db,current['professional_id'], 'Atraso no serviço' if late else 'Lembrete do serviço',
            ('A tolerância de 15 minutos terminou. ' if late else 'Seu serviço está próximo. Faça check-in ao chegar. ') +
            'Após 1 hora sem check-in: bloqueio de 24 horas na primeira falta e 30 dias a partir da segunda.',
            '/pedidos',dedup_key=f'attendance:{current["id"]}:{current["professional_id"]}:{stage}',strict=True)
    next_time = start + (timedelta(hours=1) if late else timedelta(minutes=15))
    return False, {'available_at':next_time}
