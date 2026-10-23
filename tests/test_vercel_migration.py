"""Offline migration checks; never connect to a real database or auth service."""
import asyncio
import importlib
import io
import os
from types import SimpleNamespace
from unittest.mock import Mock, patch

import pytest
from starlette.datastructures import Headers, UploadFile


def test_blob_adapter_keeps_storage_path_and_private_access(monkeypatch):
    from backend import storage
    from vercel.blob import sync as blob

    monkeypatch.setenv("STORAGE_PROVIDER", "vercel")
    monkeypatch.setenv("BLOB_READ_WRITE_TOKEN", "unit-test-placeholder")
    put = Mock(return_value=SimpleNamespace(pathname="servicoja/uploads/test.jpg"))
    get = Mock(return_value=SimpleNamespace(body=b"image", metadata=SimpleNamespace(content_type="image/jpeg")))
    monkeypatch.setattr(blob, "put_blob", put)
    monkeypatch.setattr(blob, "get_blob", get)
    result = storage.put_object("servicoja/uploads/test.jpg", b"image", "image/jpeg")
    assert result == {"path": "servicoja/uploads/test.jpg", "size": 5}
    assert put.call_args.kwargs["access"] == "private"
    assert storage.get_object(result["path"]) == (b"image", "image/jpeg")
    assert get.call_args.kwargs["access"] == "private"


def test_clerk_uses_marketplace_key_without_emergent_proxy(monkeypatch):
    from backend import clerk_auth

    monkeypatch.delenv("CLERK_PUBLISHABLE_KEY", raising=False)
    monkeypatch.delenv("CLERK_USE_PROXY", raising=False)
    monkeypatch.setenv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_unit_test")
    monkeypatch.setenv("CLERK_SECRET_KEY", "unit-test-placeholder")
    assert clerk_auth.clerk_config() == {
        "enabled": True, "publishable_key": "pk_live_unit_test", "proxy_url": ""
    }


def test_upload_rejects_large_files_and_active_image_types(monkeypatch):
    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    with patch("motor.motor_asyncio.AsyncIOMotorClient"):
        server = importlib.import_module("backend.server")

    for data, content_type in [(b"x" * (server.MAX_UPLOAD + 1), "image/jpeg"), (b"<svg/>", "image/svg+xml")]:
        file = UploadFile(filename="test", file=io.BytesIO(data), headers=Headers({"content-type": content_type}))
        with pytest.raises(server.HTTPException) as error:
            asyncio.run(server.upload(file, {"user_id": "test"}))
        assert error.value.status_code == 400


def test_profile_cover_validates_owner_and_supports_removal(monkeypatch):
    from unittest.mock import AsyncMock

    monkeypatch.setenv("MONGO_URL", "mongodb://localhost:27017")
    with patch("motor.motor_asyncio.AsyncIOMotorClient"):
        server = importlib.import_module("backend.server")
    member = {"user_id": "owner", "role": "contratante"}
    users = SimpleNamespace(update_one=AsyncMock(), find_one=AsyncMock(return_value={**member, "cover": "image-path"}))
    monkeypatch.setattr(server, "db", SimpleNamespace(users=users))
    validate = AsyncMock()
    monkeypatch.setattr(server, "check_image", validate)
    result = asyncio.run(server.update_me(server.ProfileUpdate(cover="image-path"), member))
    validate.assert_awaited_once_with("image-path", "owner")
    users.update_one.assert_awaited_with({"user_id": "owner"}, {"$set": {"cover": "image-path"}})
    assert result["cover"] == "image-path"
    assert server.PUBLIC["cover"] == 1
    validate.reset_mock()
    asyncio.run(server.update_me(server.ProfileUpdate(cover=None), member))
    validate.assert_not_awaited()
    users.update_one.assert_awaited_with({"user_id": "owner"}, {"$set": {"cover": None}})
    validate.side_effect = server.HTTPException(403, "Arquivo não autorizado")
    users.update_one.reset_mock()
    with pytest.raises(server.HTTPException):
        asyncio.run(server.update_me(server.ProfileUpdate(cover="someone-elses-image"), member))
    users.update_one.assert_not_awaited()


def test_presence_expires_and_handles_legacy_profiles(monkeypatch):
    from datetime import datetime, timezone, timedelta
    server = importlib.import_module("backend.server")
    assert server.with_presence({})["is_online"] is False
    assert server.with_presence({"last_seen": "invalid"})["is_online"] is False
    assert server.with_presence({"last_seen": datetime.now(timezone.utc).isoformat()})["is_online"] is True
    assert server.with_presence({"last_seen": (datetime.now(timezone.utc) - timedelta(seconds=76)).isoformat()})["is_online"] is False


def test_chat_audio_and_proposals_enforce_conversation_membership(monkeypatch):
    from unittest.mock import AsyncMock
    from pydantic import ValidationError
    server = importlib.import_module("backend.server")
    member = {"user_id": "sender", "role": "profissional"}
    conv = {"id": "chat", "participants": ["sender", "recipient"]}
    membership = AsyncMock(return_value=conv)
    monkeypatch.setattr(server, "my_conversation", membership)
    message = AsyncMock(return_value={"id": "message"})
    monkeypatch.setattr(server, "add_message", message)
    files = SimpleNamespace(insert_one=AsyncMock(), find_one=AsyncMock(return_value={"conversation_id": "chat"}))
    messages = SimpleNamespace(find_one=AsyncMock(return_value={"audio_path": "private/audio"}), find_one_and_update=AsyncMock(return_value={"id": "proposal", "sender_id": "recipient"}))
    monkeypatch.setattr(server, "db", SimpleNamespace(files=files, messages=messages))
    monkeypatch.setattr(server, "put_object", Mock(return_value={"path": "private/audio"}))
    monkeypatch.setattr(server, "get_object", Mock(return_value=(b"audio", "audio/webm")))
    file = UploadFile(filename="voice.webm", file=io.BytesIO(b"audio"), headers=Headers({"content-type": "audio/webm;codecs=opus"}))
    asyncio.run(server.send_audio("chat", file, member))
    assert files.insert_one.call_args.args[0]["conversation_id"] == "chat"
    assert message.call_args.kwargs["kind"] == "audio"
    assert asyncio.run(server.read_audio("chat", "message", member)).body == b"audio"
    with pytest.raises(server.HTTPException):
        asyncio.run(server.download("private/audio"))
    for payload, mime in [(b"", "audio/webm"), (b"x" * (server.MAX_UPLOAD + 1), "audio/webm"), (b"html", "text/html")]:
        bad = UploadFile(filename="bad", file=io.BytesIO(payload), headers=Headers({"content-type": mime}))
        with pytest.raises(server.HTTPException):
            asyncio.run(server.send_audio("chat", bad, member))
    with pytest.raises(ValidationError):
        server.ProposalIn(description="Service", amount=float("nan"))
    asyncio.run(server.send_proposal("chat", server.ProposalIn(description=" Pintura ", amount=125.5, deadline="Sexta"), member))
    assert message.call_args.kwargs["proposal"]["status"] == "pending"
    asyncio.run(server.respond_proposal("chat", "proposal", server.ProposalStatusIn(status="accepted"), member))
    query = messages.find_one_and_update.call_args.args[0]
    assert query["sender_id"] == {"$ne": "sender"}
    assert query["proposal.status"] == "pending"
    messages.find_one_and_update.return_value = None
    with pytest.raises(server.HTTPException) as error:
        asyncio.run(server.respond_proposal("chat", "proposal", server.ProposalStatusIn(status="declined"), member))
    assert error.value.status_code == 409
    membership.side_effect = server.HTTPException(404, "Conversa não encontrada")
    message.reset_mock()
    with pytest.raises(server.HTTPException):
        asyncio.run(server.send_proposal("other", server.ProposalIn(description="Service", amount=50), member))
    with pytest.raises(server.HTTPException):
        asyncio.run(server.read_audio("other", "message", member))
    message.assert_not_awaited()


def test_check_in_out_records_server_time_and_rejects_invalid_transitions(monkeypatch):
    from datetime import datetime
    from unittest.mock import AsyncMock
    server = importlib.import_module("backend.server")
    member = {"user_id": "pro", "role": "profissional"}
    state = {"id": "job", "status": "aceito", "client_id": "client", "professional_id": "pro"}
    async def find_one(query, projection):
        if "$or" in query:
            return dict(state) if any(state.get(key) == val for part in query["$or"] for key, val in part.items()) else None
        return dict(state) if state["status"] in query["status"]["$in"] and state["professional_id"] == query.get("professional_id") else None
    async def update(query, changes, **kwargs):
        if state["status"] not in query["status"]["$in"] or state["professional_id"] != query.get("professional_id"):
            return None
        state.update(changes["$set"])
        return dict(state)
    users = SimpleNamespace(update_one=AsyncMock())
    monkeypatch.setattr(server, "db", SimpleNamespace(requests=SimpleNamespace(find_one=find_one, find_one_and_update=update), users=users))
    async def enrich(items, *args, **kwargs):
        return items
    monkeypatch.setattr(server, "enrich_requests", enrich)
    monkeypatch.setattr(server, "notify_request", AsyncMock())
    with pytest.raises(server.HTTPException):
        asyncio.run(server.check_out_service("job", member))
    with pytest.raises(server.HTTPException):
        asyncio.run(server.check_in_service("job", {"user_id": "client"}))
    result = asyncio.run(server.check_in_service("job", member))
    assert result["status"] == "em_andamento"
    assert result["check_in_by"] == "pro"
    started = result["check_in_at"]
    with pytest.raises(server.HTTPException):
        asyncio.run(server.check_in_service("job", member))
    assert state["check_in_at"] == started
    result = asyncio.run(server.check_out_service("job", member))
    assert result["status"] == "concluido"
    assert result["check_out_by"] == "pro"
    assert result["check_out_at"] == result["completed_at"]
    assert datetime.fromisoformat(result["check_out_at"]) >= datetime.fromisoformat(started)
    assert result["service_duration_seconds"] >= 0
    with pytest.raises(server.HTTPException):
        asyncio.run(server.check_out_service("job", member))
    users.update_one.assert_awaited_once()


def test_start_chat_from_available_vacancy_and_keep_inbox_private(monkeypatch):
    from unittest.mock import AsyncMock
    server = importlib.import_module("backend.server")
    vacancy = {"id": "vacancy", "client_id": "author", "professional_id": None, "target_pro_id": None, "status": "pendente"}
    requests = SimpleNamespace(find_one=AsyncMock(return_value=vacancy))
    create = AsyncMock(return_value={"id": "existing-chat"})
    monkeypatch.setattr(server, "get_or_create_conversation", create)
    cursor = Mock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=[])
    conversations = SimpleNamespace(find=Mock(return_value=cursor))
    monkeypatch.setattr(server, "db", SimpleNamespace(users=SimpleNamespace(find_one=AsyncMock(return_value={"user_id": "author"})), requests=requests, conversations=conversations))
    member = {"user_id": "pro", "role": "profissional"}
    body = server.ConversationIn(user_id="author", request_id="vacancy")
    assert asyncio.run(server.start_conversation(body, member)) == {"id": "existing-chat"}
    create.assert_awaited_once_with("pro", "author", "vacancy")
    assert asyncio.run(server.start_conversation(server.ConversationIn(user_id="author"), member))["id"] == "existing-chat"
    with pytest.raises(server.HTTPException):
        asyncio.run(server.start_conversation(server.ConversationIn(user_id="other", request_id="vacancy"), member))
    vacancy["target_pro_id"] = "someone-else"
    with pytest.raises(server.HTTPException):
        asyncio.run(server.start_conversation(body, member))
    with pytest.raises(server.HTTPException):
        asyncio.run(server.start_conversation(server.ConversationIn(user_id="pro"), member))
    monkeypatch.setattr(server, "conv_summaries", AsyncMock(return_value=[]))
    assert asyncio.run(server.list_conversations(member)) == []
    assert conversations.find.call_args.args[0] == {"participants": "pro"}


def test_application_approval_is_required_for_attendance_and_only_owner_selects(monkeypatch):
    import copy
    from unittest.mock import AsyncMock
    server = importlib.import_module("backend.server")
    state = {"id": "job", "title": "Pintura", "status": "pendente", "client_id": "owner", "professional_id": None, "applications": []}
    async def find(query, projection):
        if "status" not in query and "client_id" in query:
            return copy.deepcopy(state) if query["client_id"] == state["client_id"] else None
        if "$or" in query:
            return copy.deepcopy(state) if any(state.get(k) == v for part in query["$or"] for k, v in part.items()) else None
        if state["status"] in query["status"]["$in"] and state.get("professional_id") == query.get("professional_id"):
            return copy.deepcopy(state)
        return None
    async def update(query, changes, **kwargs):
        if isinstance(query.get("status"), str) and state["status"] != query["status"]:
            return None
        if "$push" in changes:
            uid = query["applications.professional_id"]["$ne"]
            if uid == state["client_id"] or any(a["professional_id"] == uid for a in state["applications"]):
                return None
            state["applications"].append(changes["$push"]["applications"])
        elif "applications" in query:
            if query["client_id"] != state["client_id"]:
                return None
            match = query["applications"]["$elemMatch"]
            candidate = next((a for a in state["applications"] if all(a.get(k) == v for k, v in match.items())), None)
            if not candidate:
                return None
            for key, value in changes["$set"].items():
                if key.startswith("applications.$."):
                    candidate[key.split(".")[-1]] = value
        elif state["status"] not in query["status"]["$in"] or state.get("professional_id") != query.get("professional_id"):
            return None
        state.update({k: v for k, v in changes["$set"].items() if not k.startswith("applications.$.")})
        return copy.deepcopy(state)
    monkeypatch.setattr(server, "db", SimpleNamespace(requests=SimpleNamespace(find_one=find, find_one_and_update=update), users=SimpleNamespace(update_one=AsyncMock())))
    monkeypatch.setattr(server, "get_or_create_conversation", AsyncMock(return_value={"id": "chat"}))
    monkeypatch.setattr(server, "add_message", AsyncMock())
    monkeypatch.setattr(server, "notify_request", AsyncMock())
    monkeypatch.setattr(server, "users_map", AsyncMock(return_value={}))
    pro = {"user_id": "pro", "role": "profissional"}
    other = {"user_id": "other", "role": "profissional"}
    owner = {"user_id": "owner", "role": "contratante"}
    result = asyncio.run(server.accept_request("job", pro))
    assert result["request"]["status"] == "pendente" and state["professional_id"] is None
    assert "applications" not in result["request"]
    assert result["request"]["my_application"]["status"] == "pending"
    with pytest.raises(server.HTTPException):
        asyncio.run(server.accept_request("job", pro))
    asyncio.run(server.accept_request("job", other))
    with pytest.raises(server.HTTPException):
        asyncio.run(server.check_in_service("job", pro))
    with pytest.raises(server.HTTPException):
        asyncio.run(server.decide_application("job", "pro", server.ApplicationDecision(status="approved"), pro))
    approved = asyncio.run(server.decide_application("job", "pro", server.ApplicationDecision(status="approved"), owner))
    assert approved["professional_id"] == "pro" and approved["approved_by"] == "owner"
    assert len(approved["applications"]) == 2
    with pytest.raises(server.HTTPException):
        asyncio.run(server.decide_application("job", "other", server.ApplicationDecision(status="approved"), owner))
    with pytest.raises(server.HTTPException):
        asyncio.run(server.check_in_service("job", other))
    assert asyncio.run(server.check_in_service("job", pro))["check_in_by"] == "pro"
    assert asyncio.run(server.check_out_service("job", pro))["check_out_by"] == "pro"


def test_accepted_counterproposal_attaches_new_price_to_candidate(monkeypatch):
    from unittest.mock import AsyncMock
    server = importlib.import_module("backend.server")
    proposal = {"id": "offer", "sender_id": "pro", "request_id": "job", "proposal": {"status": "pending", "amount": 250}}
    request = {"id": "job", "client_id": "owner", "status": "pendente", "budget": 200, "applications": [{"professional_id": "pro", "status": "pending"}]}
    requests = SimpleNamespace(find_one=AsyncMock(return_value=request), update_one=AsyncMock(return_value=SimpleNamespace(matched_count=1)))
    messages = SimpleNamespace(find_one=AsyncMock(return_value=proposal), find_one_and_update=AsyncMock(return_value={**proposal, "proposal": {"status": "accepted", "amount": 250}}))
    monkeypatch.setattr(server, "my_conversation", AsyncMock())
    monkeypatch.setattr(server, "db", SimpleNamespace(requests=requests, messages=messages))
    result = asyncio.run(server.respond_proposal("chat", "offer", server.ProposalStatusIn(status="accepted"), {"user_id": "owner"}))
    assert result["proposal"]["status"] == "accepted"
    change = requests.update_one.call_args.args[1]
    assert change["$set"]["applications.$.negotiated_budget"] == 250
    assert request["budget"] == 200
    with pytest.raises(server.HTTPException):
        asyncio.run(server.respond_proposal("chat", "offer", server.ProposalStatusIn(status="accepted"), {"user_id": "pro"}))


def test_portfolio_and_publications_have_separate_lifetimes(monkeypatch):
    from datetime import datetime, timezone, timedelta
    from unittest.mock import AsyncMock
    server = importlib.import_module("backend.server")
    stored = []
    posts = SimpleNamespace(insert_one=AsyncMock(side_effect=lambda doc: stored.append(doc)))
    monkeypatch.setattr(server, "db", SimpleNamespace(posts=posts))
    monkeypatch.setattr(server, "check_image", AsyncMock())
    async def enrich(items, uid): return items
    monkeypatch.setattr(server, "enrich_posts", enrich)
    member = {"user_id": "pro", "role": "profissional"}
    expiry = datetime.now(timezone.utc) + timedelta(hours=2)
    portfolio = asyncio.run(server.create_post(server.PostCreate(kind="portfolio", image="image", expires_at=expiry), member))
    assert portfolio["kind"] == "portfolio" and portfolio["expires_at"] is None
    publication = asyncio.run(server.create_post(server.PostCreate(kind="publication", image="image", expires_at=expiry), member))
    assert publication["expires_at"] == expiry.isoformat()
    with pytest.raises(server.HTTPException):
        server.expiration_iso(datetime.now(timezone.utc) - timedelta(seconds=1))
    with pytest.raises(server.HTTPException):
        asyncio.run(server.create_post(server.PostCreate(kind="portfolio", image="image"), {"user_id": "client", "role": "contratante"}))


def test_web_push_subscription_validation_and_delivery(monkeypatch):
    import base64
    import backend.notifications as notices
    from unittest.mock import AsyncMock
    import pywebpush
    keys = {"p256dh": base64.urlsafe_b64encode(b'\x04' + b'x' * 64).decode().rstrip('='), "auth": base64.urlsafe_b64encode(b'y' * 16).decode().rstrip('=')}
    subscription = {"endpoint": "https://fcm.googleapis.com/fcm/send/test", "keys": keys}
    notices.validate_subscription(subscription)
    for endpoint in ["https://localhost/private", "https://fcm.googleapis.com.evil.example/", "http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x"]:
        with pytest.raises(notices.HTTPException):
            notices.validate_subscription({"endpoint": endpoint, "keys": keys})
    cursor = SimpleNamespace(to_list=AsyncMock(return_value=[{"endpoint": subscription["endpoint"], "subscription": subscription}]))
    db = SimpleNamespace(notifications=SimpleNamespace(insert_one=AsyncMock()), push_subscriptions=SimpleNamespace(find=Mock(return_value=cursor), delete_one=AsyncMock()))
    monkeypatch.setenv("VAPID_PRIVATE_KEY", "test-key")
    send = Mock()
    monkeypatch.setattr(pywebpush, "webpush", send)
    asyncio.run(notices.send_notice(db, "recipient", "Nova mensagem", "Atualização", "/chat/chat"))
    assert db.notifications.insert_one.call_args.args[0]["user_id"] == "recipient"
    assert send.call_args.kwargs["subscription_info"] == subscription
    assert send.call_args.kwargs["ttl"] == 3600
    send.side_effect = RuntimeError("unavailable")
    asyncio.run(notices.send_notice(db, "recipient", "Nova mensagem", "Atualização", "/chat/chat"))
    assert db.notifications.insert_one.await_count == 2


def test_notification_inbox_scopes_to_authenticated_user(monkeypatch):
    from unittest.mock import AsyncMock
    server = importlib.import_module("backend.server")
    cursor = Mock(); cursor.sort.return_value = cursor; cursor.to_list = AsyncMock(return_value=[])
    notifications = SimpleNamespace(find=Mock(return_value=cursor), update_one=AsyncMock())
    monkeypatch.setattr(server, "db", SimpleNamespace(notifications=notifications))
    assert asyncio.run(server.list_notifications({"user_id": "owner"})) == []
    assert notifications.find.call_args.args[0] == {"user_id": "owner"}
    asyncio.run(server.read_notification("notice", {"user_id": "owner"}))
    assert notifications.update_one.call_args.args[0] == {"id": "notice", "user_id": "owner"}


def test_checked_in_vacancy_disappears_from_publications_but_not_portfolio(monkeypatch):
    from unittest.mock import AsyncMock
    server = importlib.import_module("backend.server")
    linked_post = {"id": "publication", "request_id": "job", "kind": "publication"}
    posts_cursor = Mock(); posts_cursor.sort.return_value = posts_cursor; posts_cursor.to_list = AsyncMock(return_value=[linked_post])
    job_cursor = SimpleNamespace(to_list=AsyncMock(return_value=[{"id": "job", "status": "em_andamento", "check_in_at": server.now_iso()}]))
    posts = SimpleNamespace(find=Mock(return_value=posts_cursor))
    monkeypatch.setattr(server, "db", SimpleNamespace(posts=posts, requests=SimpleNamespace(find=Mock(return_value=job_cursor))))
    async def enrich(items, uid): return items
    monkeypatch.setattr(server, "enrich_posts", enrich)
    member = {"user_id": "viewer"}
    assert asyncio.run(server.list_posts(me=member)) == []
    query = posts.find.call_args.args[0]
    assert query["kind"] == {"$ne": "portfolio"}
    assert "$and" in query
    posts_cursor.to_list.return_value = [{"id": "work", "kind": "portfolio"}]
    assert asyncio.run(server.list_posts(kind="portfolio", me=member))[0]["id"] == "work"
    assert posts.find.call_args.args[0] == {"kind": "portfolio"}
