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
