import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from motor.motor_asyncio import AsyncIOMotorClient

@pytest.fixture
def server(monkeypatch):
    monkeypatch.setenv('MONGO_URL', 'mongodb://127.0.0.1:27129/?replicaSet=reliability')
    from backend import server
    return server

@pytest.mark.parametrize('status', ['cancelado', 'pendente'])
def test_cancel_requires_reason_before_mutation(server, monkeypatch, status):
    requests = SimpleNamespace(find_one=AsyncMock(return_value={'status': 'aceito'}), find_one_and_update=AsyncMock())
    monkeypatch.setattr(server, 'db', SimpleNamespace(requests=requests))
    with pytest.raises(server.HTTPException) as error:
        asyncio.run(server.change_status('job', server.StatusIn(status=status, reason='  '), {'user_id':'a'}))
    assert error.value.status_code == 422
    requests.find_one_and_update.assert_not_called()

@pytest.mark.parametrize('doc', [
    {'status':'em_andamento','client_id':'a','professional_id':'b'},
    {'status':'concluido','client_id':'a','professional_id':'b'},
    {'status':'concluido','check_out_at':'now','client_id':'a','professional_id':'a'},
])
def test_review_requires_checkout_and_two_parties(server, monkeypatch, doc):
    monkeypatch.setattr(server, 'db', SimpleNamespace(requests=SimpleNamespace(find_one=AsyncMock(return_value=doc))))
    with pytest.raises(server.HTTPException) as error:
        asyncio.run(server.review_request('job', server.ReviewIn(rating=5), {'user_id':'a'}))
    assert error.value.status_code == 409

@pytest.mark.skipif(not os.getenv('RELIABILITY_TEST_MONGO'), reason='disposable replica set required')
def test_reviews_atomic_and_duplicate_and_cancellation(server, monkeypatch):
    async def scenario():
        client = AsyncIOMotorClient(os.environ['RELIABILITY_TEST_MONGO'])
        db = client['reliability_test_' + uuid4().hex]
        monkeypatch.setattr(server, 'db', db)
        monkeypatch.setattr(server, 'notify_request', AsyncMock())
        async def enrich(items, *args, **kwargs): return items
        monkeypatch.setattr(server, 'enrich_requests', enrich)
        try:
            await db.users.insert_one({'user_id':'b'})
            await db.requests.insert_one({'id':'job','client_id':'a','professional_id':'b','status':'concluido',
                'check_out_at':'now','category':'outros','client_reviewed':False,'pro_reviewed':False})
            # Simulate a failed review write: the eligibility flag must roll back.
            await db.create_collection('reviews', validator={'rating':{'$lt':1}})
            with pytest.raises(Exception):
                await server.review_request('job', server.ReviewIn(rating=5), {'user_id':'a'})
            assert not (await db.requests.find_one({'id':'job'}))['client_reviewed']
            await db.command({'collMod':'reviews','validator':{}})
            results = await asyncio.gather(*[server.review_request('job', server.ReviewIn(rating=5), {'user_id':'a'}) for _ in range(2)], return_exceptions=True)
            assert sum(isinstance(r, dict) for r in results) == 1
            assert await db.reviews.count_documents({}) == 1
            assert (await db.users.find_one({'user_id':'b'}))['rating_count'] == 1
            await db.requests.insert_one({'id':'cancel','client_id':'a','professional_id':'b','status':'aceito','updated_at':'old'})
            result = await server.change_status('cancel', server.StatusIn(status='cancelado', reason='Mudança de agenda'), {'user_id':'a'})
            assert result['last_cancellation']['reason'] == 'Mudança de agenda'
            assert result['status'] == 'cancelado'
            with pytest.raises(server.HTTPException) as error:
                await server.change_status('cancel', server.StatusIn(status='cancelado', reason='Mudança de agenda'), {'user_id':'stranger'})
            assert error.value.status_code == 404
        finally:
            await client.drop_database(db.name)
            client.close()
    asyncio.run(scenario())


def test_cancellation_reason_not_exposed_to_next_candidate():
    from backend.pricing import present_request
    doc = {'client_id':'owner', 'professional_id':'new-worker',
           'last_cancellation':{'by':'previous-worker','reason':'Private reason'}}
    import copy
    for uid in ('visitor', 'new-worker'):
        assert 'last_cancellation' not in present_request(copy.deepcopy(doc), uid)
    for uid in ('owner', 'previous-worker'):
        assert 'last_cancellation' in present_request(copy.deepcopy(doc), uid)
