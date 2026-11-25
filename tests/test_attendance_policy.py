import asyncio
import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient
from backend import attendance

NOW = datetime(2030,1,1,12,tzinfo=timezone.utc)


def test_timezone_and_policy_only_for_scheduled_jobs(monkeypatch):
    monkeypatch.setattr(attendance, 'utcnow', lambda: NOW)
    assert attendance.schedule('2030-01-02',None,-180) == {}
    doc = attendance.schedule('2030-01-02','09:00',-180)
    assert doc['service_start_at'] == '2030-01-02T12:00:00+00:00'
    assert doc['attendance_due_at'] == '2030-01-02T13:00:00+00:00'
    assert attendance.acceptance({}) == {}
    with pytest.raises(HTTPException): attendance.schedule('2020-01-01','09:00',-180)
    with pytest.raises(HTTPException): attendance.acceptance({'attendance_policy_version':1,'service_start_at':NOW.isoformat()})


@pytest.mark.skipif(not os.getenv('RELIABILITY_TEST_MONGO'), reason='disposable replica required')
def test_absence_refunds_once_and_escalates_and_expires(monkeypatch):
    async def scenario():
        client=AsyncIOMotorClient(os.environ['RELIABILITY_TEST_MONGO'])
        db=client['attendance_test_'+uuid4().hex]
        monkeypatch.setattr(attendance,'utcnow',lambda:NOW)
        try:
            await db.users.insert_one({'user_id':'worker'})
            base={'status':'aceito','client_id':'owner','professional_id':'worker','attendance_policy_version':1,
                  'service_start_at':(NOW-timedelta(hours=1)).isoformat(),'attendance_due_at':NOW.isoformat()}
            fund={'id':'fund','request_id':'one','gross':10000,'net':9000,'status':'reserved'}
            await db.requests.insert_one({**base,'id':'one','service_fund':fund})
            results=await asyncio.gather(attendance.absent(db,'one',NOW),attendance.absent(db,'one',NOW))
            assert sum(r is not None for r in results)==1
            assert (await db.users.find_one({'user_id':'worker'}))['attendance_absences']==1
            assert (await db.pix_balances.find_one({'_id':'owner'}))['available_cents']==10000
            assert await db.pix_ledger.count_documents({})==1
            assert await db.notifications.count_documents({})==2
            with pytest.raises(HTTPException) as error: await attendance.enforce(db,'worker')
            assert error.value.status_code==403
            monkeypatch.setattr(attendance,'utcnow',lambda:NOW+timedelta(days=1))
            await attendance.enforce(db,'worker')
            await db.requests.insert_one({**base,'id':'two','attendance_due_at':(NOW+timedelta(days=2)).isoformat()})
            await attendance.absent(db,'two',NOW+timedelta(days=2))
            user=await db.users.find_one({'user_id':'worker'})
            assert user['attendance_absences']==2
            assert user['attendance_blocked_until']==(NOW+timedelta(days=32)).isoformat()
            assert await db.attendance_events.count_documents({})==2
        finally:
            await client.drop_database(db.name); client.close()
    asyncio.run(scenario())


@pytest.mark.skipif(not os.getenv('RELIABILITY_TEST_MONGO'), reason='disposable replica required')
def test_no_early_or_legacy_penalty_and_reminder_dedup(monkeypatch):
    async def scenario():
        client=AsyncIOMotorClient(os.environ['RELIABILITY_TEST_MONGO']); db=client['attendance_test_'+uuid4().hex]
        monkeypatch.delenv('VAPID_PRIVATE_KEY',raising=False)
        try:
            start=NOW+timedelta(hours=1)
            r={'id':'job','status':'aceito','client_id':'owner','professional_id':'worker','attendance_policy_version':1,
               'service_start_at':start.isoformat(),'attendance_due_at':(start+timedelta(hours=1)).isoformat()}
            await db.users.insert_one({'user_id':'worker'})
            await db.requests.insert_one(dict(r))
            assert await attendance.absent(db,'job',start+timedelta(minutes=59)) is None
            monkeypatch.setattr(attendance,'utcnow',lambda:start-timedelta(minutes=15))
            for _ in range(2):
                done, checkpoint=await attendance.attendance_job(db,r)
                assert not done and checkpoint['available_at']==start+timedelta(minutes=15)
            assert await db.notifications.count_documents({})==1
            monkeypatch.setattr(attendance,'utcnow',lambda:start+timedelta(minutes=15))
            for _ in range(2): await attendance.attendance_job(db,r)
            assert await db.notifications.count_documents({})==2
            await db.requests.update_one({'id':'job'},{'$set':{'check_in_at':start.isoformat(),'status':'em_andamento'}})
            assert await attendance.absent(db,'job',start+timedelta(hours=2)) is None
            assert (await attendance.attendance_job(db,r))[0]
            await db.requests.insert_one({'id':'legacy','status':'aceito','client_id':'owner','professional_id':'worker'})
            assert await attendance.absent(db,'legacy',NOW) is None
            assert await db.attendance_events.count_documents({})==0
        finally:
            await client.drop_database(db.name); client.close()
    asyncio.run(scenario())

@pytest.mark.skipif(not os.getenv('RELIABILITY_TEST_MONGO'), reason='disposable replica required')
def test_server_rejects_new_work_for_blocked_user(monkeypatch):
    async def scenario():
        monkeypatch.setenv("MONGO_URL", os.environ["RELIABILITY_TEST_MONGO"])
        from backend import server
        client=AsyncIOMotorClient(os.environ['RELIABILITY_TEST_MONGO']); db=client['attendance_test_'+uuid4().hex]
        monkeypatch.setattr(server,'db',db)
        monkeypatch.setattr(attendance,'utcnow',lambda:NOW)
        try:
            await db.users.insert_one({'user_id':'blocked','attendance_absences':1,'attendance_blocked_until':(NOW+timedelta(days=1)).isoformat()})
            member={'user_id':'blocked'}
            calls=[server.create_post(None,member), server.create_request(None,server.BackgroundTasks(),member),
                   server.accept_request('job',member), server.accept_direct_invitation('job',member),
                   server.send_proposal('conversation',None,member)]
            for call in calls:
                with pytest.raises(HTTPException) as error: await call
                assert error.value.status_code==403
            assert await db.posts.count_documents({})==0
            assert await db.requests.count_documents({})==0
        finally:
            await client.drop_database(db.name); client.close()
    asyncio.run(scenario())

def test_worker_rejects_missing_or_wrong_secret(monkeypatch):
    from starlette.requests import Request
    from backend import jobs
    monkeypatch.setenv('CRON_SECRET','test-only-'*5)
    endpoint = jobs.build_router(None).routes[0].endpoint
    for headers in ([], [(b'authorization',b'Bearer invalid')]):
        request=Request({'type':'http','headers':headers})
        with pytest.raises(HTTPException) as error:
            asyncio.run(endpoint(request))
        assert error.value.status_code == 401
