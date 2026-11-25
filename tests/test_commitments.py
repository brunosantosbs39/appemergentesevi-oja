import asyncio
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from backend import commitments, attendance, service_funds
from backend.companies import request_row

STAMP = datetime.now(timezone.utc).isoformat()


def run(scenario):
    if not os.getenv('RELIABILITY_TEST_MONGO'):
        pytest.skip('disposable replica set required')
    async def execute():
        client = AsyncIOMotorClient(os.environ['RELIABILITY_TEST_MONGO'])
        db = client['commitments_test_' + uuid4().hex]
        try:
            await db.requests.create_index('id', unique=True)
            await scenario(db)
        finally:
            await client.drop_database(db.name)
            client.close()
    asyncio.run(execute())


async def seed(db, capacity=2, balance=50000):
    await db.requests.insert_one({'id':'vacancy', 'staffing_version':1, 'worker_count':capacity,
        'filled_slots':0, 'client_id':'owner', 'professional_id':None, 'wallet_reservation':True,
        'pricing_version':1, 'budget':100, 'title':'Equipe', 'status':'pendente',
        'created_at':STAMP, 'updated_at':STAMP, 'applications':[
            {'professional_id':uid,'status':'pending'} for uid in ('one','two','three')]})
    await db.pix_balances.insert_one({'_id':'owner', 'available_cents':balance})
    await db.users.insert_many([{'user_id':uid} for uid in ('owner','one','two','three')])


async def accept(db, uid):
    query = {'id':'vacancy', 'client_id':'owner', 'status':'pendente',
             'applications':{'$elemMatch':{'professional_id':uid, 'status':'pending'}}}
    return await commitments.approve(db, query, {'status':'aceito','professional_id':uid,
        'agreed_budget':100, 'agreed_net_cents':9000, 'accepted_at':STAMP, 'updated_at':STAMP}, 10000, 9000, STAMP)


def test_capacity_and_last_slot_race():
    async def scenario(db):
        await seed(db)
        first = await accept(db,'one')
        assert first['status'] == 'pendente' and first['filled_slots'] == 1
        results = await asyncio.gather(accept(db,'two'), accept(db,'three'), return_exceptions=True)
        assert sum(isinstance(r, dict) for r in results) == 1
        assert sum(isinstance(r, HTTPException) for r in results) == 1
        parent = await db.requests.find_one({'id':'vacancy'})
        assert parent['status'] == 'preenchido' and parent['filled_slots'] == 2
        assert 'service_fund' not in parent
        assert await db.requests.count_documents({'parent_request_id':'vacancy'}) == 2
        assert (await db.pix_balances.find_one({'_id':'owner'}))['available_cents'] == 30000
        assert await db.pix_ledger.count_documents({'kind':'service_reserve'}) == 2
        with pytest.raises(HTTPException): await accept(db,'one')
    run(scenario)


def test_insufficient_balance_rolls_back_capacity_and_child():
    async def scenario(db):
        await seed(db,balance=9999)
        with pytest.raises(HTTPException): await accept(db,'one')
        assert (await db.requests.find_one({'id':'vacancy'}))['filled_slots'] == 0
        assert await db.requests.count_documents({'parent_request_id':'vacancy'}) == 0
        assert await db.pix_ledger.count_documents({}) == 0
    run(scenario)


def test_worker_cancel_reopens_single_slot_without_penalty_and_refunds_once():
    async def scenario(db):
        await seed(db,capacity=1)
        await accept(db,'one')
        child = await db.requests.find_one({'parent_request_id':'vacancy'})
        await db.requests.update_one({'id':child['id']},{'$set':{'attendance_policy_version':1,
            'attendance_due_at':STAMP, 'service_start_at':(datetime.now(timezone.utc)-timedelta(hours=1)).isoformat()}})
        for _ in range(2):
            result = await commitments.cancel(db,child['id'],'one','Imprevisto familiar',STAMP)
            assert result['status'] == 'cancelado'
        assert await attendance.absent(db,child['id']) is None
        assert await db.attendance_events.count_documents({}) == 0
        assert 'attendance_absences' not in await db.users.find_one({'user_id':'one'})
        parent = await db.requests.find_one({'id':'vacancy'})
        assert parent['status'] == 'pendente' and parent['filled_slots'] == 0
        assert (await db.pix_balances.find_one({'_id':'owner'}))['available_cents'] == 50000
        assert await db.pix_ledger.count_documents({'kind':'service_refund'}) == 1
        await accept(db,'two')
        assert await db.requests.count_documents({'parent_request_id':'vacancy'}) == 2
    run(scenario)


def test_owner_excludes_vacancy_and_refunds_all_active_workers():
    async def scenario(db):
        await seed(db)
        await accept(db,'one'); await accept(db,'two')
        child = await db.requests.find_one({'professional_id':'one'})
        await commitments.cancel(db,child['id'],'owner','Evento cancelado',STAMP)
        await commitments.cancel(db,'vacancy','owner','Evento cancelado',STAMP)
        assert await db.requests.count_documents({'status':'cancelado'}) == 3
        assert (await db.requests.find_one({'id':'vacancy'}))['deleted_at'] == STAMP
        assert (await db.pix_balances.find_one({'_id':'owner'}))['available_cents'] == 50000
        assert await db.pix_ledger.count_documents({'kind':'service_refund'}) == 2
        assert await db.attendance_events.count_documents({}) == 0
        with pytest.raises(HTTPException): await accept(db,'three')
    run(scenario)


def test_cancel_authorization_reason_and_in_progress_protection():
    async def scenario(db):
        await seed(db)
        await accept(db,'one'); await accept(db,'two')
        child = await db.requests.find_one({'professional_id':'one'})
        with pytest.raises(HTTPException): await commitments.cancel(db,child['id'],'three','Outro candidato',STAMP)
        with pytest.raises(HTTPException): await commitments.cancel(db,child['id'],'one',' ',STAMP)
        await db.requests.update_one({'id':child['id']},{'$set':{'status':'em_andamento','check_in_at':STAMP}})
        with pytest.raises(HTTPException): await commitments.cancel(db,child['id'],'one','Desistência',STAMP)
        with pytest.raises(HTTPException): await commitments.cancel(db,'vacancy','owner','Desistência',STAMP)
        assert await db.requests.count_documents({'status':'cancelado'}) == 0
        assert await db.pix_ledger.count_documents({'kind':'service_refund'}) == 0
    run(scenario)


def test_individual_checkout_and_company_total_do_not_double_count():
    async def scenario(db):
        await seed(db)
        await accept(db,'one'); await accept(db,'two')
        child = await db.requests.find_one({'professional_id':'one'})
        await db.requests.update_one({'id':child['id']},{'$set':{'status':'em_andamento','check_in_at':STAMP}})
        query={'id':child['id'],'professional_id':'one','status':'em_andamento'}
        changes={'status':'concluido','check_out_at':STAMP}
        await service_funds.checkout(db,query,changes,STAMP)
        assert await service_funds.checkout(db,query,changes,STAMP) is None
        assert (await db.pix_balances.find_one({'_id':'one'}))['available_cents'] == 9000
        assert await db.pix_balances.find_one({'_id':'two'}) is None
        assert (await db.requests.find_one({'professional_id':'two'}))['service_fund']['status'] == 'reserved'
        rows=await db.requests.find({}).to_list(10)
        assert sum(request_row(r)['amount_cents'] for r in rows) == 20000
    run(scenario)


def test_routes_hide_full_vacancy_preserve_private_commitments(monkeypatch):
    monkeypatch.setenv('MONGO_URL','mongodb://127.0.0.1:27129/?replicaSet=reliability')
    from backend import server
    async def scenario(db):
        monkeypatch.setattr(server,'db',db)
        monkeypatch.setattr(server,'enforce_attendance',AsyncMock())
        monkeypatch.setattr(server,'real_guard',lambda:None)
        monkeypatch.setattr(server,'get_or_create_conversation',AsyncMock(return_value={'id':'chat'}))
        monkeypatch.setattr(server,'add_message',AsyncMock())
        await seed(db,capacity=1)
        result=await server.decide_application('vacancy','one',server.ApplicationDecision(status='approved'),{'user_id':'owner'})
        assert result['status']=='preenchido'
        assert result['applications'][0]['status']=='approved'
        feed=await server.feed_requests(limit=20,me={'user_id':'three'})
        assert feed['items']==[]
        mine=await server.my_requests(me={'user_id':'one'})
        child=next(r for r in mine if r.get('parent_request_id'))
        assert child['agreed_budget']==90 and child['payment_status']=='reserved'
        with pytest.raises(HTTPException): await server.get_request(child['id'],{'user_id':'three'})
        result=await server.change_status(child['id'],server.StatusIn(status='pendente',reason='Imprevisto familiar'),{'user_id':'one'})
        assert result['status']=='cancelado'
        feed=await server.feed_requests(limit=20,me={'user_id':'three'})
        assert len(feed['items'])==1 and 'last_cancellation' not in feed['items'][0]
    run(scenario)


def test_worker_count_validation(monkeypatch):
    monkeypatch.setenv('MONGO_URL','mongodb://127.0.0.1:27129/?replicaSet=reliability')
    from backend.server import RequestCreate
    from pydantic import ValidationError
    for count in (0, -1, 101, 1.5, True):
        with pytest.raises(ValidationError): RequestCreate(category='garcom',title='Equipe',lat=0,lng=0,worker_count=count)
    assert RequestCreate(category='garcom',title='Equipe',lat=0,lng=0).worker_count==1
