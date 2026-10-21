"""ServiçoJá API regression tests: auth/me, professionals, posts, requests lifecycle, reviews, conversations."""
import io
import time

import pytest
import requests

from conftest import API

PIN = {"lat": -23.5614, "lng": -46.6828}  # Pinheiros (test pro location)
PNG = (b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
       b"\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xa7\x35\x81\x84\x00\x00\x00\x00IEND\xaeB`\x82")


def upload(s):
    r = s.post(f"{API}/upload", files={"file": ("t.png", io.BytesIO(PNG), "image/png")})
    assert r.status_code == 200, r.text
    return r.json()["path"]


def new_request(s, **kw):
    body = {"category": "eletricista", "title": f"TEST_req_{time.time()}", "budget": 150, **PIN, **kw}
    r = s.post(f"{API}/requests", json=body)
    assert r.status_code == 200, r.text
    return r.json()


# ---------- me / onboarding ----------
class TestMe:
    def test_me_requires_auth(self):
        assert requests.get(f"{API}/me").status_code == 401
        assert requests.get(f"{API}/me", headers={"Authorization": "Bearer garbage"}).status_code == 401

    def test_me_stub_and_role_required(self, fresh_user):
        s = fresh_user["session"]
        r = s.get(f"{API}/me")
        assert r.status_code == 200
        assert r.json()["role"] is None and r.json()["user_id"] == fresh_user["user_id"]
        assert s.get(f"{API}/posts").status_code == 403  # not onboarded
        r = s.put(f"{API}/me", json={"name": "TEST Novo"})
        assert r.status_code == 400

    def test_me_onboard(self, fresh_user):
        s = fresh_user["session"]
        r = s.put(f"{API}/me", json={"role": "contratante", "name": "TEST Terceiro", **PIN, "categories": ["x", "pintor"]})
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["role"] == "contratante" and d["name"] == "TEST Terceiro" and d["categories"] == ["pintor"]
        assert s.get(f"{API}/me").json()["lat"] == PIN["lat"]
        # update without role works now
        assert s.put(f"{API}/me", json={"bio": "TEST bio"}).status_code == 200

    def test_existing_users(self, client_s, pro_s):
        assert client_s.get(f"{API}/me").json()["role"] == "contratante"
        assert pro_s.get(f"{API}/me").json()["role"] == "profissional"


# ---------- professionals ----------
class TestProfessionals:
    def test_filters(self, client_s):
        r = client_s.get(f"{API}/professionals", params={**PIN, "radius_km": 50})
        assert r.status_code == 200
        pros = r.json()
        assert any(p["user_id"] == "seed_pro_carlos" for p in pros)
        assert all(p["distance_km"] is not None and p["distance_km"] <= 50 for p in pros)
        assert [p["distance_km"] for p in pros] == sorted(p["distance_km"] for p in pros)
        assert all("_id" not in p for p in pros)
        r = client_s.get(f"{API}/professionals", params={**PIN, "category": "encanador"}).json()
        assert r and all("encanador" in p["categories"] for p in r)
        r = client_s.get(f"{API}/professionals", params={**PIN, "radius_km": 1}).json()
        assert all(p["distance_km"] <= 1 for p in r)
        r = client_s.get(f"{API}/professionals", params={"sort": "rating"}).json()
        ratings = [p["rating_avg"] for p in r]
        assert ratings == sorted(ratings, reverse=True)

    def test_user_profile_and_reviews(self, client_s):
        r = client_s.get(f"{API}/users/seed_pro_carlos")
        assert r.status_code == 200 and r.json()["name"] == "Carlos Henrique"
        assert client_s.get(f"{API}/users/does_not_exist").status_code == 404
        assert isinstance(client_s.get(f"{API}/users/seed_pro_carlos/reviews").json(), list)


# ---------- posts ----------
class TestPosts:
    def test_post_flow(self, client_s, pro_s):
        assert pro_s.post(f"{API}/posts", json={"image": "bogus/path.png", "caption": "TEST_x"}).status_code == 400
        path = upload(pro_s)
        f = requests.get(f"{API}/files/{path}")
        assert f.status_code == 200 and f.headers["content-type"].startswith("image/png")
        # other user cannot use my image
        assert client_s.post(f"{API}/posts", json={"image": path, "caption": "TEST_steal"}).status_code == 400
        r = pro_s.post(f"{API}/posts", json={"image": path, "caption": "TEST_post", "category": "eletricista"})
        assert r.status_code == 200, r.text
        post = r.json()
        assert post["likes_count"] == 0 and post["author"]["role"] == "profissional"
        pid = post["id"]
        feed = client_s.get(f"{API}/posts").json()
        assert feed[0]["id"] == pid
        assert any(p["id"] == pid for p in client_s.get(f"{API}/posts", params={"category": "eletricista"}).json())
        assert all(p["category"] == "pintor" for p in client_s.get(f"{API}/posts", params={"category": "pintor"}).json())
        mine = client_s.get(f"{API}/posts", params={"user_id": post["user_id"]}).json()
        assert all(p["user_id"] == post["user_id"] for p in mine)
        # like toggle
        assert client_s.post(f"{API}/posts/{pid}/like").json() == {"liked": True, "likes_count": 1}
        assert client_s.get(f"{API}/posts", params={"user_id": post["user_id"]}).json()[0]["liked"] is True
        assert client_s.post(f"{API}/posts/{pid}/like").json() == {"liked": False, "likes_count": 0}
        # comments
        c = client_s.post(f"{API}/posts/{pid}/comments", json={"text": "TEST_comment"})
        assert c.status_code == 200 and c.json()["author"]["role"] == "contratante"
        assert client_s.post(f"{API}/posts/{pid}/comments", json={"text": "   "}).status_code == 400
        cs = client_s.get(f"{API}/posts/{pid}/comments").json()
        assert len(cs) == 1 and cs[0]["text"] == "TEST_comment"
        assert client_s.get(f"{API}/posts", params={"user_id": post["user_id"]}).json()[0]["comments_count"] == 1
        # delete: other -> 404, own -> ok
        assert client_s.delete(f"{API}/posts/{pid}").status_code == 404
        assert pro_s.delete(f"{API}/posts/{pid}").status_code == 200
        assert not any(p["id"] == pid for p in client_s.get(f"{API}/posts").json())
        assert client_s.post(f"{API}/posts/{pid}/like").status_code == 404

    def test_upload_rejects_non_image(self, pro_s):
        r = pro_s.post(f"{API}/upload", files={"file": ("a.txt", io.BytesIO(b"hi"), "text/plain")})
        assert r.status_code == 400
        assert requests.post(f"{API}/upload", files={"file": ("t.png", io.BytesIO(PNG), "image/png")}).status_code == 401


# ---------- requests lifecycle ----------
class TestRequests:
    def test_only_client_creates(self, pro_s, client_s):
        r = pro_s.post(f"{API}/requests", json={"category": "eletricista", "title": "TEST_pro", **PIN})
        assert r.status_code == 403
        r = client_s.post(f"{API}/requests", json={"category": "nope", "title": "TEST_bad", **PIN})
        assert r.status_code == 400
        assert client_s.get(f"{API}/requests/available").status_code == 403

    def test_full_lifecycle(self, client_s, pro_s, tokens, fresh_user):
        req = new_request(client_s)
        rid = req["id"]
        assert req["status"] == "pendente"
        avail = pro_s.get(f"{API}/requests/available", params={**PIN, "radius_km": 10}).json()
        assert any(x["id"] == rid for x in avail)
        far = pro_s.get(f"{API}/requests/available", params={"lat": -22.9, "lng": -43.2, "radius_km": 10}).json()
        assert not any(x["id"] == rid for x in far)
        assert client_s.post(f"{API}/requests/{rid}/accept").status_code == 403
        assert client_s.post(f"{API}/requests/{rid}/review", json={"rating": 5}).status_code == 409
        a = pro_s.post(f"{API}/requests/{rid}/accept")
        assert a.status_code == 200, a.text
        conv_id = a.json()["conversation_id"]
        assert a.json()["request"]["status"] == "aceito"
        assert pro_s.post(f"{API}/requests/{rid}/accept").status_code == 409
        msgs = client_s.get(f"{API}/conversations/{conv_id}/messages").json()
        assert any(m["system"] and "aceitou" in m["text"] for m in msgs)
        mine = client_s.get(f"{API}/requests/mine").json()
        assert any(x["id"] == rid and x["status"] == "aceito" for x in mine)
        # non-participant
        third = fresh_user["session"]
        assert third.post(f"{API}/requests/{rid}/status", json={"status": "concluido"}).status_code == 404
        assert third.get(f"{API}/requests/{rid}").status_code == 404
        # invalid transitions
        assert client_s.post(f"{API}/requests/{rid}/status", json={"status": "em_andamento"}).status_code == 409
        assert pro_s.post(f"{API}/requests/{rid}/status", json={"status": "cancelado"}).status_code == 409
        assert pro_s.post(f"{API}/requests/{rid}/status", json={"status": "foo"}).status_code == 422
        jobs_before = pro_s.get(f"{API}/me").json()["jobs_done"]
        r = pro_s.post(f"{API}/requests/{rid}/status", json={"status": "em_andamento"})
        assert r.status_code == 200 and r.json()["status"] == "em_andamento"
        assert pro_s.post(f"{API}/requests/{rid}/status", json={"status": "pendente"}).status_code == 409
        r = client_s.post(f"{API}/requests/{rid}/status", json={"status": "concluido"})
        assert r.status_code == 200 and r.json()["status"] == "concluido"
        assert pro_s.get(f"{API}/me").json()["jobs_done"] == jobs_before + 1
        assert client_s.post(f"{API}/requests/{rid}/status", json={"status": "cancelado"}).status_code == 409
        # reviews
        pro_id = tokens["pro"]["user_id"]
        rv = client_s.post(f"{API}/requests/{rid}/review", json={"rating": 4, "comment": "TEST_ok"})
        assert rv.status_code == 200 and rv.json()["to_id"] == pro_id
        assert client_s.post(f"{API}/requests/{rid}/review", json={"rating": 5}).status_code == 409
        assert client_s.post(f"{API}/requests/{rid}/review", json={"rating": 6}).status_code == 422
        prof = client_s.get(f"{API}/users/{pro_id}").json()
        assert prof["rating_count"] >= 1
        revs = client_s.get(f"{API}/users/{pro_id}/reviews").json()
        assert revs[0]["comment"] == "TEST_ok" and revs[0]["author"]["role"] == "contratante"
        pv = pro_s.post(f"{API}/requests/{rid}/review", json={"rating": 5, "comment": "TEST_client_ok"})
        assert pv.status_code == 200 and pv.json()["to_id"] == tokens["client"]["user_id"]

    def test_give_up_and_cancel(self, client_s, pro_s):
        rid = new_request(client_s)["id"]
        assert pro_s.post(f"{API}/requests/{rid}/accept").status_code == 200
        r = pro_s.post(f"{API}/requests/{rid}/status", json={"status": "pendente"})
        assert r.status_code == 200 and r.json()["status"] == "pendente" and r.json()["professional_id"] is None
        assert any(x["id"] == rid for x in pro_s.get(f"{API}/requests/available", params=PIN).json())
        r = client_s.post(f"{API}/requests/{rid}/status", json={"status": "cancelado"})
        assert r.status_code == 200 and r.json()["status"] == "cancelado"
        assert not any(x["id"] == rid for x in pro_s.get(f"{API}/requests/available", params=PIN).json())
        assert pro_s.post(f"{API}/requests/{rid}/accept").status_code == 409

    def test_targeted_request(self, client_s, pro_s, tokens):
        rid = new_request(client_s, target_pro_id="seed_pro_rafael")["id"]
        avail = pro_s.get(f"{API}/requests/available", params={**PIN, "radius_km": 100}).json()
        assert not any(x["id"] == rid for x in avail)
        assert pro_s.post(f"{API}/requests/{rid}/accept").status_code == 409
        rid2 = new_request(client_s, target_pro_id=tokens["pro"]["user_id"], lat=-22.9, lng=-43.2)["id"]
        avail = pro_s.get(f"{API}/requests/available", params={**PIN, "radius_km": 5}).json()
        assert avail and avail[0]["id"] == rid2  # targeted shown first even outside radius
        assert client_s.post(f"{API}/requests", json={"category": "pintor", "title": "TEST_bad_target",
                                                       "target_pro_id": "seed_cli_fernanda", **PIN}).status_code == 400
        client_s.post(f"{API}/requests/{rid}/status", json={"status": "cancelado"})
        client_s.post(f"{API}/requests/{rid2}/status", json={"status": "cancelado"})


# ---------- conversations ----------
class TestConversations:
    def test_conversation_flow(self, client_s, pro_s, tokens, fresh_user):
        pro_id = tokens["pro"]["user_id"]
        c1 = client_s.post(f"{API}/conversations", json={"user_id": pro_id}).json()["id"]
        c2 = pro_s.post(f"{API}/conversations", json={"user_id": tokens["client"]["user_id"]}).json()["id"]
        assert c1 == c2
        assert client_s.post(f"{API}/conversations", json={"user_id": tokens["client"]["user_id"]}).status_code == 400
        assert client_s.post(f"{API}/conversations", json={"user_id": "nobody"}).status_code == 404
        pro_s.get(f"{API}/conversations/{c1}/messages")  # mark read
        before = pro_s.get(f"{API}/conversations/unread-count").json()["count"]
        m = client_s.post(f"{API}/conversations/{c1}/messages", json={"text": "TEST_hello"})
        assert m.status_code == 200 and m.json()["sender_id"] == tokens["client"]["user_id"]
        assert pro_s.get(f"{API}/conversations/unread-count").json()["count"] == before + 1
        lst = pro_s.get(f"{API}/conversations").json()
        conv = next(c for c in lst if c["id"] == c1)
        assert conv["other"]["user_id"] == tokens["client"]["user_id"] and conv["unread"] >= 1
        assert conv["last_message"] == "TEST_hello"
        after = m.json()["created_at"]
        m2 = client_s.post(f"{API}/conversations/{c1}/messages", json={"text": "TEST_second"}).json()
        newer = pro_s.get(f"{API}/conversations/{c1}/messages", params={"after": after}).json()
        assert [x["id"] for x in newer] == [m2["id"]]
        assert pro_s.get(f"{API}/conversations/unread-count").json()["count"] == before  # c1 read again
        assert client_s.post(f"{API}/conversations/{c1}/messages", json={"text": ""}).status_code == 422
        third = fresh_user["session"]
        assert third.get(f"{API}/conversations/{c1}/messages").status_code == 404
        assert third.post(f"{API}/conversations/{c1}/messages", json={"text": "x"}).status_code == 404
        assert third.get(f"{API}/conversations/{c1}").status_code == 404
