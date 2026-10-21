"""Ad-hoc race check: parallel accept and parallel conversation get-or-create (run manually)."""
import json
import os
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor

import requests
from conftest import API, _bapi, _token_for

t = json.loads(subprocess.check_output(["python3", "/app/scripts/clerk_test_tokens.py"]))
cs = {"Authorization": "Bearer " + t["client"]["token"]}
ps = {"Authorization": "Bearer " + t["pro"]["token"]}
rid = requests.post(f"{API}/requests", headers=cs, json={"category": "pintor", "title": "TEST_race",
                                                        "lat": -23.56, "lng": -46.68}).json()["id"]
with ThreadPoolExecutor(6) as ex:
    codes = list(ex.map(lambda _: requests.post(f"{API}/requests/{rid}/accept", headers=ps).status_code, range(6)))
print("accept codes", codes)
requests.post(f"{API}/requests/{rid}/status", headers=cs, json={"status": "cancelado"})
# conversation race with a brand new pair
email = f"test_race_{int(time.time())}+clerk_test@example.com"
u = _bapi("/users", {"email_address": [email], "password": os.environ["CLERK_TEST_PASSWORD"], "skip_password_checks": True})
nh = {"Authorization": "Bearer " + _token_for(u["id"])}
requests.put(f"{API}/me", headers=nh, json={"role": "contratante", "name": "TEST Race"})
with ThreadPoolExecutor(6) as ex:
    res = list(ex.map(lambda _: requests.post(f"{API}/conversations", headers=nh, json={"user_id": "seed_pro_carlos"}), range(6)))
print("conv codes", [r.status_code for r in res], {r.text for r in res})
_bapi(f"/users/{u['id']}", method="DELETE")
print("new user", u["id"])
