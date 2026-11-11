"""Mandatory private registration. Passwords remain exclusively with Clerk."""
import math
import re
from datetime import datetime, timezone
import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ConfigDict, field_validator
from starlette.concurrency import run_in_threadpool

class Address(BaseModel):
    model_config = ConfigDict(extra="forbid")
    postal_code: str
    street: str = Field(min_length=2, max_length=150)
    number: str = Field(min_length=1, max_length=20)
    complement: str = Field("", max_length=100)
    district: str = Field(min_length=2, max_length=100)
    city: str = Field(min_length=2, max_length=80)
    state: str = Field(pattern=r"^[A-Z]{2}$")

    @field_validator("postal_code")
    @classmethod
    def postal(cls, value):
        value = re.sub(r"[^0-9]", "", value)
        if len(value) != 8:
            raise ValueError("Informe um CEP de 8 dígitos")
        return value

    @field_validator("street", "number", "district", "city")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Campo obrigatório")
        return value.strip()

class Registration(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=80)
    categories: list[str] = Field(default_factory=list, max_length=5)
    custom_roles: list[str] = Field(default_factory=list, max_length=5)

    @field_validator("custom_roles", "categories")
    @classmethod
    def valid_roles(cls, values):
        clean = list(dict.fromkeys(v.strip() for v in values))
        if any(not 2 <= len(v) <= 80 for v in clean):
            raise ValueError("Informe funções de 2 a 80 caracteres")
        return clean

    address: Address
    # For CEPs without coordinates, the user can explicitly confirm a map point.
    location: dict | None = None

    @field_validator("name")
    @classmethod
    def valid_name(cls, value):
        if len(value.strip()) < 2:
            raise ValueError("Informe seu nome completo")
        return value.strip()

def complete(me):
    return bool(me.get("registration_completed_at") and me.get("address") and me.get("email"))

def valid_point(lat, lng):
    return (isinstance(lat, (int, float)) and not isinstance(lat, bool)
            and isinstance(lng, (int, float)) and not isinstance(lng, bool)
            and math.isfinite(lat) and math.isfinite(lng)
            and -34 <= lat <= 6 and -74 <= lng <= -34)

def lookup_postal(cep):
    try:
        r = requests.get(f"https://brasilapi.com.br/api/cep/v2/{cep}", timeout=12)
        if r.status_code == 404:
            raise HTTPException(422, "CEP não encontrado. Confira os números.")
        r.raise_for_status()
        data = r.json()
    except (requests.RequestException, ValueError):
        raise HTTPException(503, "A consulta de CEP está indisponível. Tente novamente.")
    if not data.get("city") or not data.get("state"):
        raise HTTPException(503, "Não foi possível confirmar a região deste CEP.")
    coord = (data.get("location") or {}).get("coordinates") or {}
    try:
        lat, lng = float(coord.get("latitude")), float(coord.get("longitude"))
    except (ValueError, TypeError):
        lat, lng = None, None
    return {"postal_code": cep, "street": data.get("street") or "",
            "district": data.get("neighborhood") or "", "city": data["city"],
            "state": data["state"], "lat": lat if valid_point(lat, lng) else None,
            "lng": lng if valid_point(lat, lng) else None}

def verified_email(uid):
    try:
        from backend.clerk_auth import _secret_key, CLERK_BACKEND_API
    except ModuleNotFoundError:
        from clerk_auth import _secret_key, CLERK_BACKEND_API
    try:
        response = requests.get(f"{CLERK_BACKEND_API}/users/{uid}",
            headers={"Authorization": f"Bearer {_secret_key()}"}, timeout=10)
        response.raise_for_status()
        user = response.json()
    except (requests.RequestException, ValueError):
        raise HTTPException(503, "Não foi possível confirmar seu e-mail. Tente novamente.")
    primary = next((item for item in user.get("email_addresses", [])
                    if item["id"] == user.get("primary_email_address_id")), None)
    if not primary or (primary.get("verification") or {}).get("status") != "verified":
        raise HTTPException(403, "Confirme seu e-mail antes de concluir o cadastro.")
    return primary["email_address"]

def build_router(db, current_member):
    router = APIRouter(prefix="/api/me")

    async def region(cep):
        cached = await db.postal_regions.find_one({"_id": cep})
        if cached and cached.get("region"):
            return cached["region"]
        result = await run_in_threadpool(lookup_postal, cep)
        await db.postal_regions.update_one({"_id": cep}, {"$set": {"region": result}}, upsert=True)
        return result

    @router.get("/address/{cep}")
    async def resolve(cep: str, me=Depends(current_member)):
        if not re.fullmatch(r"[0-9]{8}", cep):
            raise HTTPException(422, "Informe um CEP de 8 dígitos")
        return await region(cep)

    @router.put("/registration")
    async def register(body: Registration, me=Depends(current_member)):
        resolved = await region(body.address.postal_code)
        if body.address.city.casefold() != resolved["city"].casefold() or body.address.state != resolved["state"]:
            raise HTTPException(422, "A cidade e o estado devem corresponder ao CEP consultado.")
        lat, lng = resolved["lat"], resolved["lng"]
        source = "postal_code"
        if body.location is not None:
            lat, lng = body.location.get("lat"), body.location.get("lng")
            if not valid_point(lat, lng):
                raise HTTPException(422, "Confirme um ponto válido no mapa do Brasil.")
            source = "user_confirmed"
        if not valid_point(lat, lng):
            raise HTTPException(422, "Este CEP não tem coordenadas. Confirme sua região no mapa.")
        email = await run_in_threadpool(verified_email, me["user_id"])
        update = {"categories": list(dict.fromkeys(body.categories + (["outros"] if body.custom_roles else []))), "custom_roles": body.custom_roles, "name": body.name, "address": body.address.model_dump(), "email": email,
                  "city": f'{resolved["city"]}, {resolved["state"]}', "lat": lat, "lng": lng,
                  "location_source": source, "role": "membro",
                  "registration_completed_at": datetime.now(timezone.utc).isoformat()}
        await db.users.update_one({"user_id": me["user_id"]}, {"$set": update})
        result = await db.users.find_one({"user_id": me["user_id"]}, {"_id": 0})
        result["registration_complete"] = complete(result)
        return result
    return router
