"""Security regression tests use synthetic identities and locally signed tokens only."""
import asyncio
import base64
import time
from types import SimpleNamespace
from unittest.mock import Mock
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi import HTTPException
from starlette.requests import Request
from backend import clerk_auth as auth
from tests.test_scaling import local_database

@pytest.fixture
def signer(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    monkeypatch.setenv("CLERK_PUBLISHABLE_KEY", "pk_test_" + base64.b64encode(b"security.clerk.accounts.dev$").decode())
    monkeypatch.setenv("CLERK_SECRET_KEY", "test-only")
    monkeypatch.setenv("CLERK_AUTHORIZED_PARTIES", "https://app.example.com")
    monkeypatch.setattr(auth, "_jwks_client", lambda _: SimpleNamespace(get_signing_key_from_jwt=lambda _: SimpleNamespace(key=key.public_key())))
    now = int(time.time())
    claims = dict(sub="user_test", sid="sess_test", iss="https://security.clerk.accounts.dev", azp="https://app.example.com", exp=now+60, nbf=now-5, iat=now)
    return lambda data=claims: jwt.encode(data, key, algorithm="RS256"), claims


def test_valid_signed_session(signer):
    sign, _ = signer
    assert auth.verify_session_token(sign())["sub"] == "user_test"

@pytest.mark.parametrize("field", ["exp", "nbf", "iat", "iss", "sub", "sid"])
def test_missing_required_claim_is_rejected(signer, field):
    sign, claims = signer
    del claims[field]
    with pytest.raises(HTTPException) as error:
        auth.verify_session_token(sign(claims))
    assert error.value.status_code == 401

@pytest.mark.parametrize("field,value", [("iss", "https://other.clerk.accounts.dev"), ("azp", "https://evil.example"), ("exp", 1), ("sid", ""), ("sub", ""), ("nbf", 9999999999)])
def test_wrong_or_expired_claim_is_rejected(signer, field, value):
    sign, claims = signer
    claims[field] = value
    with pytest.raises(HTTPException) as error:
        auth.verify_session_token(sign(claims))
    assert error.value.status_code == 401

def test_forged_signature_is_rejected(signer):
    _, claims = signer
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    with pytest.raises(HTTPException) as error:
        auth.verify_session_token(jwt.encode(claims, other_key, algorithm="RS256"))
    assert error.value.status_code == 401

@pytest.mark.parametrize("origin", [None, "https://evil.example", "null"])
def test_cookie_write_rejects_untrusted_or_missing_origin(signer, origin):
    sign, _ = signer
    headers = [(b"cookie", ("__session=" + sign()).encode())]
    if origin: headers.append((b"origin", origin.encode()))
    with pytest.raises(HTTPException) as error:
        auth.require_user(Request({"type":"http", "method":"POST", "headers":headers}))
    assert error.value.status_code == 403

def test_cookie_write_allows_trusted_origin(signer):
    sign, _ = signer
    request = Request({"type":"http", "method":"POST", "headers": [(b"cookie", ("__session="+sign()).encode()), (b"origin", b"https://app.example.com")]})
    assert auth.require_user(request)["user_id"] == "user_test"

def test_professional_location_is_coarse_in_payload_and_radius_queries(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            await db.users.insert_one({"user_id":"private", "name":"Test", "role":"membro", "categories":["eletricista"], "lat":-16.6071, "lng":-49.2071, "email":"private@example.com", "address":{"number":"123"}})
            me = {"user_id":"viewer", "lat":-16.6071, "lng":-49.2071}
            found = await server.professionals(-16.6071, -49.2071, 25, None, None, "distance", 10, 0, me)
            assert len(found) == 1
            assert found[0]["lat"] == -16.6 and found[0]["lng"] == -49.2
            assert found[0]["distance_km"] > 1
            assert not {"email", "address"} & found[0].keys()
            assert await server.professionals(-16.6071, -49.2071, .01, None, None, "distance", 10, 0, me) == []
            detail = await server.get_user("private", me)
            assert detail["distance_km"] > 1
            assert not {"lat", "lng", "email", "address"} & detail.keys()
            stored = await db.users.find_one({"user_id":"private"})
            assert stored["lat"] == -16.6071
    asyncio.run(run())


def test_anonymous_private_routes_rejected_and_never_cached(monkeypatch):
    async def run():
        import httpx
        async with local_database(monkeypatch) as (server, _):
            monkeypatch.setenv("CLERK_SECRET_KEY", "test-only")
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=server.app), base_url="https://app.example.com") as client:
                for path in ("/api/me", "/api/companies", "/api/professionals", "/api/conversations", "/api/notifications"):
                    response = await client.get(path)
                    assert response.status_code == 401, path
                    assert "no-store" in response.headers["cache-control"]
                    assert response.headers["x-content-type-options"] == "nosniff"
    asyncio.run(run())
