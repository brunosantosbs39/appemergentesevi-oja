"""Real local Mongo transactions and crash recovery; never contacts providers."""
import asyncio
from datetime import timedelta
from unittest.mock import AsyncMock
import pytest
from fastapi import HTTPException, FastAPI
from fastapi.testclient import TestClient
from test_scaling import local_database
from backend import production_wallet as w, jobs, opportunities, notifications

def payment_env(monkeypatch):
    monkeypatch.setenv("ASAAS_PRODUCTION_ENABLED", "true")
    monkeypatch.setenv("ASAAS_API_KEY", "local-test-only")
    monkeypatch.setenv("ASAAS_WEBHOOK_TOKEN", "x" * 40)

def body(key="intent-recovery-00001"):
    return w.DepositIn(amount_cents=1000, cpf_cnpj="52998224725", idempotency_key=key)

def replies():
    return [{"data":[{"id":"cus_test","cpfCnpj":"52998224725"}]}, {"id":"pay_test"},
            {"encodedImage":"YWJj","payload":"TEST","expirationDate":"2030-01-01"}]

def test_pre_payment_failure_releases_and_next_intent_succeeds(monkeypatch):
    payment_env(monkeypatch)
    async def run():
        async with local_database(monkeypatch) as (_,db):
            monkeypatch.setattr(w,"call",AsyncMock(side_effect=w.ProviderError()))
            first=await w.create_deposit(db,{"user_id":"owner"},body())
            assert first["status"]=="failed"
            assert await db.pix_creation_locks.count_documents({})==0
            monkeypatch.setattr(w,"call",AsyncMock(side_effect=replies()))
            second=await w.create_deposit(db,{"user_id":"owner"},body("intent-recovery-00002"))
            assert second["pix_copy_paste"]=="TEST"
            assert await db.pix_balances.count_documents({})==0
    asyncio.run(run())

def test_ambiguous_payment_post_stays_review_and_never_reposts(monkeypatch):
    payment_env(monkeypatch)
    async def run():
        async with local_database(monkeypatch) as (_,db):
            call=AsyncMock(side_effect=[replies()[0],w.ProviderError()])
            monkeypatch.setattr(w,"call",call)
            first=await w.create_deposit(db,{"user_id":"owner"},body())
            assert first["status"]=="review"
            await w.create_deposit(db,{"user_id":"owner"},body())
            assert call.await_count==2
            monkeypatch.setattr(w,"call",AsyncMock(return_value={"data":[]}))
            await w.reconcile(db,first["id"])
            with pytest.raises(HTTPException) as error:
                await w.create_deposit(db,{"user_id":"owner"},body("intent-recovery-00003"))
            assert error.value.status_code==409
            assert await db.pix_creation_locks.count_documents({})==1
    asyncio.run(run())

def test_stale_creator_cannot_post_after_recovery(monkeypatch):
    payment_env(monkeypatch)
    async def run():
        async with local_database(monkeypatch) as (_,db):
            started=asyncio.Event(); resume=asyncio.Event(); calls=[]
            async def provider(method,path,**kwargs):
                calls.append((method,path)); started.set(); await resume.wait()
                return replies()[0]
            monkeypatch.setattr(w,"call",provider)
            creator=asyncio.create_task(w.create_deposit(db,{"user_id":"owner"},body()))
            await started.wait()
            op=await db.pix_deposits.find_one({"user_id":"owner"})
            await db.pix_deposits.update_one({"_id":op["_id"]},{"$set":{"prepare_until":w.now()-timedelta(seconds=1)}})
            await w.reconcile(db,op["_id"])
            resume.set()
            assert (await creator)["status"]=="failed"
            assert calls==[("GET","/customers")]
            assert await db.pix_creation_locks.count_documents({})==0
    asyncio.run(run())

def test_concurrent_payment_delivery_still_credits_exactly_once(monkeypatch):
    payment_env(monkeypatch)
    async def run():
        async with local_database(monkeypatch) as (_,db):
            await db.pix_deposits.insert_one({"_id":"op","id":"op","user_id":"owner","amount_cents":1000,
                "status":"pending","provider_payment_id":"pay_test","customer_id":"cus_test"})
            monkeypatch.setattr(w,"call",AsyncMock(return_value={"id":"pay_test","externalReference":"op",
                "customer":"cus_test","billingType":"PIX","value":10,"netValue":9,"status":"RECEIVED"}))
            await asyncio.gather(*(w.reconcile(db,"op") for _ in range(32)))
            assert await db.pix_ledger.count_documents({})==1
            assert (await db.pix_balances.find_one({"_id":"owner"}))["available_cents"]==900
    asyncio.run(run())

def test_one_worker_claim_and_failed_work_retries(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (_,db):
            await db.notifications.insert_one({"_id":"one","delivery":jobs.pending()})
            results=await asyncio.gather(*(jobs.claim(db.notifications,"delivery") for _ in range(20)))
            assert sum(r is not None for r in results)==1
            await db.notifications.update_one({"_id":"one"},{"$set":{"delivery.lease_until":jobs.now()-timedelta(seconds=1)}})
            async def fail(db,doc): raise RuntimeError("temporary")
            await jobs.process_one(db,"notifications","delivery",fail)
            doc=await db.notifications.find_one({"_id":"one"})
            assert doc["delivery"]["state"]=="ready" and doc["delivery"]["attempts"]==1
            assert await jobs.claim(db.notifications,"delivery") is None
            await db.notifications.update_one({"_id":"one"},{"$set":{"delivery.available_at":jobs.now()}})
            async def success(db,doc): return True, {}
            await jobs.process_one(db,"notifications","delivery",success)
            assert (await db.notifications.find_one({"_id":"one"}))["delivery"]["state"]=="done"
    asyncio.run(run())

def test_fanout_checkpoint_replay_does_not_duplicate_notices(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (_,db):
            await db.users.insert_many([{"user_id":f"pro-{i:03}","role":"membro","categories":["eletricista"],
                "lat":-23.55,"lng":-46.63} for i in range(101)])
            request={"id":"request","client_id":"owner","category":"eletricista","status":"pendente",
                     "title":"Vaga teste","lat":-23.55,"lng":-46.63,"alert_job":jobs.pending()}
            await db.requests.insert_one(request.copy())
            done, checkpoint=await opportunities.opportunity_batch(db,request)
            assert not done
            await opportunities.opportunity_batch(db,request) # crash before checkpoint commit
            assert await db.notifications.count_documents({})==50
            request["alert_job"].update(checkpoint)
            done, checkpoint=await opportunities.opportunity_batch(db,request)
            assert not done
            request["alert_job"].update(checkpoint)
            done,_=await opportunities.opportunity_batch(db,request)
            assert done and await db.notifications.count_documents({})==101
    asyncio.run(run())

def test_internal_worker_requires_secret(monkeypatch):
    monkeypatch.setenv("CRON_SECRET","s"*40)
    app=FastAPI(); app.include_router(jobs.build_router(None))
    with TestClient(app) as client:
        assert client.get("/api/internal/jobs").status_code==401
        assert client.get("/api/internal/jobs",headers={"Authorization":"Bearer wrong"}).status_code==401

def test_feed_index_bounds_scan(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server,db):
            await db.requests.insert_many([{"id":f"r{i:05}","status":"pendente","target_pro_id":None,
                "category":"eletricista","created_at":f"2026-10-{i%28+1:02}","expires_at":None} for i in range(2000)])
            query={"status":"pendente","target_pro_id":None,"$and":[server.vacancy_open_query()]}
            for category in (False,True):
                if category: query["category"]="eletricista"
                explain=await db.command({"explain":{"find":"requests","filter":query,
                    "sort":{"created_at":-1,"id":-1},"limit":21},"verbosity":"executionStats"})
                assert explain["executionStats"]["totalDocsExamined"]<=25
    asyncio.run(run())

def test_request_persists_job_and_returns_no_worker_metadata(monkeypatch):
    import httpx
    async def run():
        async with local_database(monkeypatch) as (server,db):
            await db.users.insert_many([
                {"user_id":"owner","name":"Owner","role":"membro","registration_completed_at":"2026-01-01","email":"owner@example.com","address":{"city":"Test"}},
                {"user_id":"near","name":"Pro","role":"membro","categories":["eletricista"],"lat":-23.55,"lng":-46.63}])
            async def identity(): return {"user_id":"owner"}
            server.app.dependency_overrides[server.require_user]=identity
            try:
                async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app),base_url="http://local") as client:
                    response=await client.post("/api/requests",json={"title":"Vaga teste","category":"eletricista","lat":-23.55,"lng":-46.63})
                    assert response.status_code==200,response.text
                    assert "alert_job" not in response.json()
                    doc=await db.requests.find_one({"id":response.json()["id"]})
                    assert doc["alert_job"]["state"]=="done"
                    assert await db.notifications.count_documents({"user_id":"near"})==1
            finally: server.app.dependency_overrides.clear()
    asyncio.run(run())
