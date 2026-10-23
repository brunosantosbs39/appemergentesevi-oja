"""Scaling regressions against a disposable local MongoDB, never production.
Run: SCALING_TEST_MONGO_URL=mongodb://127.0.0.1:27028 uv run --with pytest --with httpx==0.27.2 --with-requirements backend/requirements.txt python -m pytest tests -q
"""
import asyncio
import importlib
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock, patch

import pytest

from backend.scaling import page_cursor, parse_cursor, write_limit, ReadBurstGuard


def test_cursor_rejects_invalid_and_round_trips():
    value = [datetime.now(timezone.utc).isoformat(), "same-time-id"]
    assert parse_cursor(page_cursor(*value)) == tuple(value)
    for invalid in ["nope", "x" * 513, "WzEsMl0=", "bnVsbA=="]:
        with pytest.raises(Exception) as error:
            parse_cursor(invalid)
        assert error.value.status_code == 400


def test_read_guard_is_bounded_and_does_not_limit_other_members():
    guard = ReadBurstGuard(maximum=2, capacity=2)
    guard.check("a"); guard.check("a"); guard.check("b")
    with pytest.raises(Exception) as error:
        guard.check("a")
    assert error.value.status_code == 429
    assert int(error.value.headers["Retry-After"]) > 0
    with pytest.raises(Exception):
        guard.check("c")
    assert len(guard.windows) == 2


@asynccontextmanager
async def local_database(monkeypatch):
    uri = os.environ.get("SCALING_TEST_MONGO_URL")
    if not uri:
        pytest.skip("Set SCALING_TEST_MONGO_URL for disposable MongoDB integration tests")
    from urllib.parse import urlparse
    assert urlparse(uri).hostname in ("localhost", "127.0.0.1"), "Integration tests only accept a local database"
    from motor.motor_asyncio import AsyncIOMotorClient
    monkeypatch.setenv("MONGO_URL", uri)
    monkeypatch.setenv("SEED_DEMO", "false")
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    server = importlib.import_module("backend.server")
    client = AsyncIOMotorClient(uri, serverSelectionTimeoutMS=2000)
    name = "scaling_test_" + uuid.uuid4().hex
    db = client[name]
    monkeypatch.setattr(server, "db", db)
    monkeypatch.setattr(server, "init_storage", Mock())
    try:
        await server.startup()
        yield server, db
    finally:
        await client.drop_database(name)
        client.close()


def test_nearby_search_does_not_drop_the_1001st_professional(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            await db.users.insert_many([{"user_id": f"far-{n}", "role": "profissional", "name": "Far", "lat": 0, "lng": 0} for n in range(1500)] + [{"user_id": "near", "role": "profissional", "name": "Near", "lat": -16.6, "lng": -49.2, "private_field": "must-not-leak"}])
            found = await server.professionals(-16.6, -49.2, 25, None, None, "distance", 10, 0, {"user_id": "viewer"})
            assert [p["user_id"] for p in found] == ["near"]
            assert found[0]["distance_km"] < .001
            assert "private_field" not in found[0]
            # Radius zero sorts across the entire matching base before selecting a page.
            found = await server.professionals(-16.6, -49.2, 0, None, None, "distance", 10, 0, {"user_id": "viewer"})
            assert found[0]["user_id"] == "near"
            assert len(found) == 10
            # Check the actual query uses a coordinate index for bounded searches.
            indexes = await db.users.index_information()
            assert any(i["key"] == [("role", 1), ("lat", 1), ("lng", 1)] for i in indexes.values())
    asyncio.run(run())


def test_search_handles_dateline_poles_and_direct_invites(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            await db.users.insert_many([{"user_id": "dateline", "role": "profissional", "lat": 0, "lng": -179.95}, {"user_id": "pole", "role": "profissional", "lat": 89.99, "lng": 100}])
            found = await server.professionals(0, 179.95, 20, None, None, "distance", 10, 0, {"user_id": "viewer"})
            assert [p["user_id"] for p in found] == ["dateline"]
            found = await server.professionals(89.99, 0, 20, None, None, "distance", 10, 0, {"user_id": "viewer"})
            assert [p["user_id"] for p in found] == ["pole"]
            await db.requests.insert_many([{"id": "direct", "client_id": "owner", "target_pro_id": "viewer", "status": "pendente", "lat": None, "lng": None}, {"id": "near", "client_id": "owner", "target_pro_id": None, "status": "pendente", "lat": 0, "lng": 179.95}])
            found = await server.available_requests(0, 179.95, 20, None, 50, 0, {"user_id": "viewer"})
            assert [r["id"] for r in found] == ["direct", "near"]
    asyncio.run(run())


def test_shared_write_limit_is_atomic_across_concurrent_calls(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (_, db):
            results = await asyncio.gather(*(write_limit(db, "member", "/api/conversations/chat/messages") for _ in range(100)), return_exceptions=True)
            rejected = [r for r in results if isinstance(r, Exception)]
            assert len(rejected) == 40
            assert all(r.status_code == 429 for r in rejected)
            assert all(int(r.headers["Retry-After"]) > 0 for r in rejected)
            await write_limit(db, "another-member", "/api/conversations/chat/messages")
            indexes = await db.rate_limits.index_information()
            assert any(i.get("expireAfterSeconds") == 0 for i in indexes.values())
    asyncio.run(run())


def test_incremental_chat_keeps_history_updates_and_same_timestamp_backlogs(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            stamp = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
            await db.conversations.insert_one({"id": "chat", "participants": ["me", "other"], "last_at": stamp, "unread": {"me": 0}})
            await db.messages.insert_many([{"id": f"m{n:04}", "conversation_id": "chat", "created_at": stamp, "updated_at": stamp, "text": str(n)} for n in range(250)])
            initial = await server.sync_conversation("chat", me={"user_id": "me"})
            assert len(initial["messages"]) == 50
            assert initial["has_history"]
            older = await server.list_messages("chat", before=initial["history_cursor"], mark_read=False, limit=50, me={"user_id": "me"})
            assert len(older) == 50
            assert not set(m["id"] for m in older) & set(m["id"] for m in initial["messages"])
            unchanged = await server.sync_conversation("chat", after=initial["cursor"], me={"user_id": "me"})
            assert unchanged["messages"] == []
            changed = datetime.now(timezone.utc).isoformat()
            await db.messages.update_one({"id": "m0000"}, {"$set": {"proposal": {"status": "accepted"}, "updated_at": changed}})
            delta = await server.sync_conversation("chat", after=initial["cursor"], me={"user_id": "me"})
            assert delta["messages"][0]["proposal"]["status"] == "accepted"
            cursor = page_cursor(stamp, "")
            received = []
            for _ in range(4):
                delta = await server.sync_conversation("chat", after=cursor, mark_read=False, me={"user_id": "me"})
                received += [m["id"] for m in delta["messages"]]
                cursor = delta["cursor"]
                if not delta["has_more"]: break
            assert set(received) == {f"m{n:04}" for n in range(250)}
            with pytest.raises(server.HTTPException) as err:
                await server.sync_conversation("chat", me={"user_id": "stranger"})
            assert err.value.status_code == 404
    asyncio.run(run())


def test_inbox_pagination_and_unread_count_include_more_than_500_chats(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            stamp = server.now_iso()
            await db.conversations.insert_many([{"id": f"c{n:04}", "pair_key": f"me|other-{n}", "participants": ["me", f"other-{n}"], "last_at": stamp, "unread": {"me": 1}} for n in range(550)])
            first = await server.list_conversations({"user_id": "me"}, limit=50)
            last = first[-1]
            second = await server.list_conversations({"user_id": "me"}, before=page_cursor(last["last_at"], last["id"]), limit=50)
            assert len(first) == len(second) == 50
            assert not {c["id"] for c in first} & {c["id"] for c in second}
            assert (await server.unread_count({"user_id": "me"}))["count"] == 550
    asyncio.run(run())


def test_push_persists_before_background_delivery_and_context_is_reset(monkeypatch):
    import backend.notifications as notices
    from fastapi import BackgroundTasks
    async def run():
        tasks = BackgroundTasks()
        context = notices.notification_tasks(tasks)
        await anext(context)
        monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-key")
        deliver = AsyncMock()
        monkeypatch.setattr(notices, "deliver_notice", deliver)
        db = SimpleNamespace(notifications=SimpleNamespace(insert_one=AsyncMock()))
        await notices.send_notice(db, "recipient", "Title", "Body", "/chat/one")
        db.notifications.insert_one.assert_awaited_once()
        deliver.assert_not_awaited()
        with pytest.raises(StopAsyncIteration):
            await anext(context)
        assert notices._request_tasks.get() is None
        await tasks()
        deliver.assert_awaited_once()
    asyncio.run(run())


def test_request_pages_include_old_history_and_scope_to_account(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            stamp = server.now_iso()
            await db.requests.insert_many([{"id": f"r{n:04}", "client_id": "me", "professional_id": None, "created_at": stamp, "status": "pendente"} for n in range(550)] + [{"id": "private", "client_id": "someone", "status": "pendente", "created_at": stamp}])
            cursor = None; ids = []
            for _ in range(6):
                page = await server.my_requests({"user_id": "me"}, before=cursor)
                ids.extend(r["id"] for r in page)
                if len(page) < 100: break
                cursor = page_cursor(page[-1]["created_at"], page[-1]["id"])
            assert len(ids) == len(set(ids)) == 550
            assert "private" not in ids
    asyncio.run(run())


def test_http_sync_keeps_auth_and_authorization_and_returns_retry_on_db_failure(monkeypatch):
    async def run():
        import httpx
        from pymongo.errors import WaitQueueTimeoutError
        async with local_database(monkeypatch) as (server, db):
            await db.users.insert_one({"user_id": "me", "role": "profissional"})
            await db.conversations.insert_one({"id": "chat", "participants": ["me", "other"], "last_at": server.now_iso(), "unread": {}})
            monkeypatch.setenv("CLERK_SECRET_KEY", "unit-test-placeholder")
            transport = httpx.ASGITransport(app=server.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                assert (await client.get("/api/conversations/chat/sync")).status_code == 401
                server.app.dependency_overrides[server.require_user] = lambda: {"user_id": "me"}
                try:
                    response = await client.get("/api/conversations/chat/sync")
                    assert response.status_code == 200, response.text
                    assert response.json()["messages"] == []
                    assert (await client.get("/api/conversations/stranger/sync")).status_code == 404
                    assert (await client.get("/api/conversations/chat/sync", params={"after": "invalid"})).status_code == 400
                    monkeypatch.setattr(server, "my_conversation", AsyncMock(side_effect=WaitQueueTimeoutError("test")))
                    response = await client.get("/api/conversations/chat/sync")
                    assert response.status_code == 503
                    assert response.headers["retry-after"] == "5"
                finally:
                    server.app.dependency_overrides.clear()
    asyncio.run(run())


def test_feed_cursor_advances_even_when_a_page_contains_closed_jobs(monkeypatch):
    async def run():
        from fastapi import Response
        async with local_database(monkeypatch) as (server, db):
            stamp = server.now_iso()
            await db.requests.insert_one({"id": "closed", "status": "concluido"})
            await db.posts.insert_many([{"id": f"p{n:04}", "user_id": "owner", "kind": "publication", "created_at": stamp, "request_id": "closed" if n else None} for n in range(61)])
            response = Response()
            first = await server.list_posts(me={"user_id": "viewer"}, response=response)
            assert first == []
            cursor = response.headers["x-next-cursor"]
            second = await server.list_posts(me={"user_id": "viewer"}, before=cursor)
            assert [p["id"] for p in second] == ["p0000"]
    asyncio.run(run())
