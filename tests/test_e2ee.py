"""WebCrypto ↔ Python interop and disposable MongoDB security regressions."""
import asyncio
import copy
import io
import json
import subprocess
from pathlib import Path
from unittest.mock import Mock

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile
from backend.e2ee import IdentityIn, Envelope, validate_identity, validate_envelope, decode
from tests.test_scaling import local_database

@pytest.fixture(scope="module")
def wire():
    return json.loads(subprocess.check_output(["node", "tests/e2ee-fixture.mjs"], cwd=Path(__file__).resolve().parents[1]))

def test_browser_identity_proof_is_bound_to_account_and_backup(wire):
    record = wire["identities"][0]
    body = IdentityIn(**{k: record[k] for k in ("public", "backup", "proof")})
    assert validate_identity(body, "alice") == record["key_id"]
    with pytest.raises(HTTPException): validate_identity(body, "eve")
    changed = body.model_copy(deep=True)
    changed.backup.iv = "AAAAAAAAAAAAAAAA"
    with pytest.raises(HTTPException): validate_identity(changed, "alice")

def test_encrypted_chat_and_identity_privacy_with_real_database(monkeypatch, wire):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            conv = {"id": "chat", "participants": ["alice", "bob"], "last_at": server.now_iso(), "unread": {}}
            await db.conversations.insert_one(dict(conv))
            for record in wire["identities"]:
                body = IdentityIn(**{k: record[k] for k in ("public", "backup", "proof")})
                result = await server.register_crypto_identity(body, {"user_id": record["user_id"]})
                assert "backup" not in result and "proof" not in result
                assert (await server.register_crypto_identity(body, {"user_id": record["user_id"]}))["key_id"] == record["key_id"]
            # A valid key belonging to the other account cannot replace an identity.
            with pytest.raises(HTTPException):
                await server.register_crypto_identity(IdentityIn(**{k: wire["identities"][1][k] for k in ("public", "backup", "proof")}), {"user_id": "alice"})
            own = await server.own_crypto_identity({"user_id": "bob"})
            assert "backup" in own["identity"]
            peer = await server.contact_crypto_identity("bob", {"user_id": "alice"})
            assert "backup" not in peer["identity"]
            with pytest.raises(HTTPException): await server.contact_crypto_identity("bob", {"user_id": "eve"})
            packet = Envelope(**wire["text"])
            await validate_envelope(db, conv, "alice", packet, "text")
            result = await server.send_encrypted_message("chat", packet, {"user_id": "alice"})
            assert result["kind"] == "encrypted_text"
            assert "PLAINTEXT_SENTINEL" not in json.dumps(result)
            assert (await server.send_encrypted_message("chat", packet, {"user_id": "alice"}))["id"] == result["id"]
            assert await db.messages.count_documents({"conversation_id": "chat"}) == 1
            assert (await db.conversations.find_one({"id": "chat"}))["last_message"] == "Mensagem protegida"
            for uid in ("bob", "eve"):
                with pytest.raises(HTTPException): await server.send_encrypted_message("chat", packet, {"user_id": uid})
            altered = packet.model_copy(deep=True); altered.signature = "A" * 86
            with pytest.raises(HTTPException): await server.send_encrypted_message("chat", altered, {"user_id": "alice"})
            altered = packet.model_copy(deep=True); altered.header.conversation_id = "another"
            with pytest.raises(HTTPException): await validate_envelope(db, conv, "alice", altered, "text")
            await db.messages.update_one({"id": result["id"]}, {"$set": {"e2ee.ciphertext": "conflicting"}})
            with pytest.raises(HTTPException) as error: await server.send_encrypted_message("chat", packet, {"user_id": "alice"})
            assert error.value.status_code == 409
            put = Mock(return_value={"path": "private/cipher.encrypted"})
            monkeypatch.setattr(server, "put_object", put)
            binary = decode(wire["file"])
            audio = await server.send_encrypted_audio("chat", json.dumps(wire["audio"]), UploadFile(file=io.BytesIO(binary), filename="audio.encrypted"), {"user_id": "alice"})
            assert put.call_args.args[1] == binary
            assert put.call_args.args[2] == "application/octet-stream"
            assert b"AUDIO_SENTINEL" not in binary
            assert audio["kind"] == "encrypted_audio"
            stored_file = await db.files.find_one({"storage_path": "private/cipher.encrypted"})
            assert stored_file["e2ee"] is True and stored_file["conversation_id"] == "chat"
            assert await db.messages.count_documents({"client_id": wire["audio"]["header"]["client_id"]}) == 1
            await server.send_encrypted_audio("chat", json.dumps(wire["audio"]), UploadFile(file=io.BytesIO(binary)), {"user_id": "alice"})
            assert put.call_count == 1
            await db.messages.delete_one({"id": audio["id"]})
            with pytest.raises(HTTPException): await server.send_encrypted_audio("chat", json.dumps(wire["audio"]), UploadFile(file=io.BytesIO(b"altered")), {"user_id": "alice"})
            assert put.call_count == 1
            await db.e2ee_identities.delete_one({"user_id": "bob"})
            with pytest.raises(HTTPException) as error: await validate_envelope(db, conv, "alice", packet, "text")
            assert error.value.status_code == 409
    asyncio.run(run())
