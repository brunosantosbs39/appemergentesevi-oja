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
    messages = SimpleNamespace(find_one=AsyncMock(return_value={"audio_path": "private/audio"}), find_one_and_update=AsyncMock(return_value={"id": "proposal"}))
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
    async def enrich(items, *args):
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
