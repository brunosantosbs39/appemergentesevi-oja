"""Creates/reuses Clerk dev test users and prints session tokens + sign-in tickets (preview only)."""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
SK = os.environ["CLERK_SECRET_KEY"]
USERS = {
    "client": ("cliente+clerk_test@example.com", "Teste Contratante"),
    "pro": ("profissional+clerk_test@example.com", "Teste Profissional"),
}
PASSWORD = os.environ["CLERK_TEST_PASSWORD"]


def bapi(path, body=None, method="POST"):
    req = urllib.request.Request("https://api.clerk.com/v1" + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + SK, "Content-Type": "application/json",
                                          "User-Agent": "emergent-test"})
    return json.load(urllib.request.urlopen(req))


def get_user(email, name):
    found = bapi("/users?" + urllib.parse.urlencode({"email_address": email}), method="GET")
    if found:
        return found[0]
    first, last = name.split(" ", 1)
    return bapi("/users", {"email_address": [email], "password": PASSWORD, "skip_password_checks": True,
                           "first_name": first, "last_name": last})


out = {}
for key in (sys.argv[1:] or USERS.keys()):
    email, name = USERS[key]
    user = get_user(email, name)
    session = bapi("/sessions", {"user_id": user["id"]})
    token = bapi(f"/sessions/{session['id']}/tokens", {"expires_in_seconds": 3600})["jwt"]
    ticket = bapi("/sign_in_tokens", {"user_id": user["id"], "expires_in_seconds": 3600})["token"]
    out[key] = {"user_id": user["id"], "email": email, "token": token, "ticket": ticket}
print(json.dumps(out))
