import copy
import unittest
from unittest.mock import patch
import httpx
from fastapi import FastAPI
from pydantic import ValidationError
from backend.registration import Address, Registration, build_router, complete, lookup_postal

REGION = {"postal_code":"01001000", "street":"Praça da Sé", "district":"Sé", "city":"São Paulo", "state":"SP", "lat":-23.55, "lng":-46.63}
BODY = {"name":"Pessoa de Teste", "address":{k:v for k,v in REGION.items() if k not in ("lat","lng")} | {"number":"10"}}
class Collection:
    def __init__(self, doc=None): self.doc=copy.deepcopy(doc)
    async def find_one(self, query, projection=None): return copy.deepcopy(self.doc)
    async def update_one(self, query, update, **kwargs):
        self.doc={**(self.doc or {}), **update.get("$set", {})}
class DB:
    def __init__(self):
        self.users=Collection({"user_id":"authenticated-user","role":"membro"})
        self.postal_regions=Collection({"region":REGION})

class RegistrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db=DB()
        async def member(): return {"user_id":"authenticated-user"}
        self.app=FastAPI(); self.app.include_router(build_router(self.db,member))
        self.client=httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app),base_url="http://test")
        self.email=patch("backend.registration.verified_email",return_value="verified@example.com")
        self.email.start()
    async def asyncTearDown(self):
        await self.client.aclose();self.email.stop()

    async def test_requires_full_address(self):
        response=await self.client.put("/api/me/registration",json={"name":"Test","address":{"postal_code":"01001000"}})
        self.assertEqual(response.status_code,422)
        self.assertFalse(complete(self.db.users.doc))
    async def test_registered_email_is_server_verified_not_client_supplied(self):
        bad=copy.deepcopy(BODY);bad["email"]="unverified@example.com"
        self.assertEqual((await self.client.put("/api/me/registration",json=bad)).status_code,422)
        response=await self.client.put("/api/me/registration",json=BODY)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()["email"],"verified@example.com")
        self.assertEqual(response.json()["user_id"],"authenticated-user")
        self.assertTrue(response.json()["registration_complete"])
        self.assertEqual(response.json()["lat"],REGION["lat"])
    async def test_cannot_skip_using_role_or_completion_flag(self):
        for key in ["role","registration_complete","user_id"]:
            body=copy.deepcopy(BODY);body[key]="attacker"
            self.assertEqual((await self.client.put("/api/me/registration",json=body)).status_code,422)
        self.assertFalse(complete(self.db.users.doc))
    async def test_city_must_match_postal_code(self):
        body=copy.deepcopy(BODY);body["address"]["city"]="Outra cidade"
        self.assertEqual((await self.client.put("/api/me/registration",json=body)).status_code,422)
    async def test_no_default_location_when_postal_has_no_coordinates(self):
        self.db.postal_regions.doc["region"].update(lat=None,lng=None)
        self.assertEqual((await self.client.put("/api/me/registration",json=BODY)).status_code,422)
        body=copy.deepcopy(BODY);body["location"]={"lat":-23.55,"lng":-46.63}
        response=await self.client.put("/api/me/registration",json=body)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()["location_source"],"user_confirmed")
    async def test_invalid_location_rejected(self):
        for point in [{"lat":None,"lng":None},{"lat":91,"lng":0},{"lat":True,"lng":-46}]:
            body=copy.deepcopy(BODY);body["location"]=point
            self.assertEqual((await self.client.put("/api/me/registration",json=body)).status_code,422)
    async def test_unverified_google_or_email_account_cannot_complete(self):
        from fastapi import HTTPException
        with patch("backend.registration.verified_email",side_effect=HTTPException(403,"Confirm email")):
            response=await self.client.put("/api/me/registration",json=BODY)
        self.assertEqual(response.status_code,403)
        self.assertFalse(complete(self.db.users.doc))
    async def test_old_role_alone_does_not_complete_registration(self):
        self.assertFalse(complete({"role":"membro","name":"Old account"}))
    async def test_lookup_failure_does_not_create_profile(self):
        from fastapi import HTTPException
        self.db.postal_regions.doc=None
        with patch("backend.registration.lookup_postal",side_effect=HTTPException(503,"Unavailable")):
            response=await self.client.put("/api/me/registration",json=BODY)
        self.assertEqual(response.status_code,503)
        self.assertFalse(complete(self.db.users.doc))
    async def test_normalizes_postal_and_rejects_blank_fields(self):
        body=copy.deepcopy(BODY);body["address"]["postal_code"]="01001-000"
        self.assertEqual(Registration(**body).address.postal_code,"01001000")
        body["address"]["street"]="  "
        with self.assertRaises(ValidationError): Registration(**body)

if __name__=="__main__": unittest.main()
