import json
import os
import subprocess
import time
import urllib.parse

import pytest
import requests
from dotenv import load_dotenv

load_dotenv("/app/frontend/.env")
load_dotenv("/app/backend/.env")
BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

import sys
sys.path.insert(0, "/app/scripts")


def _bapi(path, body=None, method="POST"):
    sk = os.environ["CLERK_SECRET_KEY"]
    r = requests.request(method, "https://api.clerk.com/v1" + path, json=body,
                         headers={"Authorization": "Bearer " + sk, "User-Agent": "emergent-test"}, timeout=20)
    r.raise_for_status()
    return r.json() if r.content else {}


def _token_for(user_id):
    s = _bapi("/sessions", {"user_id": user_id})
    return _bapi(f"/sessions/{s['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]


@pytest.fixture(scope="session")
def tokens():
    out = subprocess.check_output(["python3", "/app/scripts/clerk_test_tokens.py", "client", "pro"])
    return json.loads(out)


def _client(tok):
    s = requests.Session()
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="session")
def client_s(tokens):
    return _client(tokens["client"]["token"])


@pytest.fixture(scope="session")
def pro_s(tokens):
    return _client(tokens["pro"]["token"])


@pytest.fixture(scope="session")
def fresh_user():
    """Brand-new Clerk user (role null in app DB). Deleted from Clerk at teardown."""
    email = f"test_new_{int(time.time())}+clerk_test@example.com"
    u = _bapi("/users", {"email_address": [email], "password": os.environ["CLERK_TEST_PASSWORD"], "skip_password_checks": True,
                         "first_name": "TEST", "last_name": "Novo"})
    tok = _token_for(u["id"])
    yield {"user_id": u["id"], "email": email, "session": _client(tok)}
    try:
        _bapi(f"/users/{u['id']}", method="DELETE")
    except Exception:
        pass
    try:
        from pymongo import MongoClient
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        db.users.delete_one({"user_id": u["id"]})
        db.conversations.delete_many({"participants": u["id"]})
    except Exception:
        pass


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_data():
    yield
    try:
        from pymongo import MongoClient
        db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
        rids = [r["id"] for r in db.requests.find({"title": {"$regex": "^TEST_"}}, {"id": 1})]
        db.requests.delete_many({"id": {"$in": rids}})
        db.reviews.delete_many({"request_id": {"$in": rids}})
        pids = [p["id"] for p in db.posts.find({"caption": {"$regex": "^TEST_"}}, {"id": 1})]
        db.posts.delete_many({"id": {"$in": pids}})
        db.comments.delete_many({"post_id": {"$in": pids}})
        db.comments.delete_many({"text": {"$regex": "^TEST_"}})
    except Exception as e:
        print("cleanup failed", e)
