"""Emergent-managed Clerk auth, inert until CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY
are set: /api/clerk/config for the frontend, the /api/__clerk production relay
(zero DNS per app), and the require_user dependency for protected routes."""

import os
import base64
from urllib.parse import urlsplit
from functools import lru_cache

import jwt
import requests
from fastapi import APIRouter, HTTPException, Request, Response
from requests.adapters import HTTPAdapter
from starlette.concurrency import run_in_threadpool
from urllib3.util.retry import Retry

CLERK_FRONTEND_API = "https://frontend-api.clerk.dev"
CLERK_BACKEND_API = "https://api.clerk.com/v1"
PROXY_PATH = "/api/__clerk"

# Per-hop headers are never relayed; requests decodes the body, so its encoding goes too.
_HOP_HEADERS = {
    "host", "connection", "keep-alive", "content-length", "transfer-encoding",
    "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate",
    "content-encoding",
}

clerk_router = APIRouter(prefix="/api")
_http = requests.Session()
# Clerk's edge closes idle keep-alive connections; retry idempotent calls on a dropped one.
_retry = Retry(total=2, connect=2, read=2, status=0, backoff_factor=0.1,
               allowed_methods=frozenset({"GET", "HEAD", "OPTIONS"}))
_http.mount("https://", HTTPAdapter(pool_maxsize=40, max_retries=_retry))  # matches the threadpool size


def _publishable_key() -> str:
    return os.environ.get("CLERK_PUBLISHABLE_KEY") or os.environ.get("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "")


def _secret_key() -> str:
    return os.environ.get("CLERK_SECRET_KEY", "")


def _is_production() -> bool:
    # Only production instances are served through the /api/__clerk proxy.
    return _publishable_key().startswith("pk_live_") and os.environ.get("CLERK_USE_PROXY", "false").lower() == "true"


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else ""


@clerk_router.get("/clerk/config")
def clerk_config():
    """What the frontend needs to start Clerk (the publishable key is public)."""
    key = _publishable_key()
    return {
        "enabled": bool(key and _secret_key()),
        "publishable_key": key,
        "proxy_url": PROXY_PATH if _is_production() else "",
    }


@clerk_router.api_route("/__clerk/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE"])
async def clerk_proxy(path: str, request: Request):
    """Relay Clerk's Frontend API through this app's own domain."""
    if not _is_production():
        raise HTTPException(status_code=404)
    host = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_HEADERS}
    headers["Clerk-Proxy-Url"] = f"https://{host.split(',')[0].strip()}{PROXY_PATH}"
    headers["Clerk-Secret-Key"] = _secret_key()
    headers["X-Forwarded-For"] = _client_ip(request)
    headers["Accept-Encoding"] = "gzip"  # requests cannot decode brotli

    try:
        upstream = await run_in_threadpool(
            _http.request,
            request.method,
            f"{CLERK_FRONTEND_API}/{path}",
            params=list(request.query_params.multi_items()),
            headers=headers,
            data=await request.body(),
            allow_redirects=False,
            timeout=30,
        )
    except requests.RequestException:
        # Clerk's frontend retries a 502; an unhandled error would be a bare 500.
        return Response(status_code=502)
    response = Response(content=upstream.content, status_code=upstream.status_code)
    raw = upstream.raw.headers
    for name in {n.lower() for n in raw.keys()} - _HOP_HEADERS:
        # getlist keeps every Set-Cookie separate; joining them breaks sessions.
        for value in raw.getlist(name):
            response.raw_headers.append((name.encode(), value.encode()))
    return response


@lru_cache(maxsize=1)
def _jwks_client(secret_key: str) -> jwt.PyJWKClient:
    # Caches Clerk's signing keys and refetches when it meets a new key id.
    return jwt.PyJWKClient(
        f"{CLERK_BACKEND_API}/jwks",
        # Clerk's edge rejects urllib's default User-Agent (Cloudflare 1010).
        headers={"Authorization": f"Bearer {secret_key}", "User-Agent": "emergent-clerk-auth"},
        lifespan=3600,
        timeout=10,
    )


def trusted_origins() -> set:
    origins = {v.strip().rstrip("/") for name in ("CLERK_AUTHORIZED_PARTIES", "CORS_ORIGINS")
               for v in os.environ.get(name, "").split(",") if v.strip()}
    for name in ("VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"):
        host = os.environ.get(name, "").strip()
        if host:
            origins.add("https://" + host)
    if not os.environ.get("VERCEL"):
        origins.update({"http://localhost:3000", "http://127.0.0.1:3000"})
    return origins


def expected_issuer() -> str:
    try:
        encoded = _publishable_key().split("_", 2)[2]
        host = base64.b64decode(encoded + "=" * (-len(encoded) % 4), validate=True).decode().rstrip("$")
        parsed = urlsplit("https://" + host)
        if not host or parsed.netloc != host or parsed.path or parsed.username:
            raise ValueError()
        return "https://" + host
    except (ValueError, IndexError, UnicodeError):
        raise HTTPException(503, "Clerk configuration is invalid")


def verify_session_token(token: str) -> dict:
    """Accept only expiring user sessions issued by this Clerk instance."""
    issuer = expected_issuer()
    try:
        key = _jwks_client(_secret_key()).get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key=key, algorithms=["RS256"], leeway=5,
                            issuer=issuer, options={"require": ["exp", "iat", "nbf", "iss", "sub", "sid"]})
        if not all(isinstance(claims[k], str) and claims[k] for k in ("sub", "sid")):
            raise jwt.InvalidTokenError()
        if claims.get("azp") is not None and (not isinstance(claims["azp"], str) or claims["azp"] not in trusted_origins()):
            raise jwt.InvalidTokenError()
        return claims
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired session")


def require_user(request: Request) -> dict:
    """Verify the session; cookie-authenticated writes also require a trusted Origin."""
    if not _secret_key():
        raise HTTPException(status_code=503, detail="Clerk is not configured")
    auth = request.headers.get("authorization", "")
    bearer = auth.lower().startswith("bearer ")
    token = auth[7:] if bearer else request.cookies.get("__session", "")
    if not token:
        raise HTTPException(status_code=401, detail="Not signed in")
    if not bearer and request.method not in {"GET", "HEAD", "OPTIONS"}:
        if request.headers.get("origin", "") not in trusted_origins():
            raise HTTPException(403, "Invalid request origin")
    claims = verify_session_token(token)
    return {"user_id": claims["sub"], "session_id": claims["sid"], "claims": claims}
