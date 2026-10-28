"""Real Pix deposits, isolated from the sandbox. All money writes use Mongo transactions."""
import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation

import requests
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

BASE = "https://api.asaas.com/v3"

def selected():
    return os.getenv("ASAAS_PRODUCTION_ENABLED") == "true"

def enabled():
    key = os.getenv("ASAAS_API_KEY", "")
    return selected() and bool(key) and "hmlg" not in key and len(os.getenv("ASAAS_WEBHOOK_TOKEN", "")) >= 32

def guard():
    if not enabled():
        raise HTTPException(503, "Depósitos Pix indisponíveis. Tente novamente mais tarde.")

def now():
    return datetime.now(timezone.utc)

def stamp():
    return now().isoformat()

def money(value):
    try:
        n = Decimal(str(value)) * 100
        if not n.is_finite() or n != n.to_integral_value():
            raise ValueError()
        return int(n)
    except (ValueError, TypeError, InvalidOperation):
        raise HTTPException(502, "Valor inválido recebido do provedor")

def document(value):
    digits = re.sub(r"[. /-]", "", value.strip())
    if not digits.isascii() or not digits.isdigit() or len(digits) not in (11, 14) or len(set(digits)) == 1:
        raise ValueError("Informe um CPF ou CNPJ válido")
    weights = (list(range(10, 1, -1)), list(range(11, 1, -1))) if len(digits) == 11 else ([5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2])
    for i, w in enumerate(weights):
        r = sum(int(digits[j]) * v for j, v in enumerate(w)) % 11
        if int(digits[len(w)]) != (0 if r < 2 else 11-r):
            raise ValueError("Informe um CPF ou CNPJ válido")
    return digits

class DepositIn(BaseModel):
    amount_cents: int = Field(strict=True, ge=500, le=10000)
    cpf_cnpj: str = Field(min_length=11, max_length=20)
    idempotency_key: str = Field(min_length=16, max_length=80, pattern=r"^[A-Za-z0-9-]+$")

    @field_validator("cpf_cnpj")
    @classmethod
    def valid_document(cls, value):
        return document(value)

class ProviderError(Exception):
    def __init__(self, definitive=False):
        self.definitive = definitive

def provider(method, path, body=None, params=None):
    guard()
    if not re.fullmatch(r"/[A-Za-z0-9_/-]+", path):
        raise ValueError("Invalid provider path")
    try:
        response = requests.request(method, BASE + path, json=body, params=params,
            headers={"access_token": os.environ["ASAAS_API_KEY"], "User-Agent": "ServicoJa-Pix/1.0"},
            timeout=(3, 10), allow_redirects=False)
        if not 200 <= response.status_code < 300:
            raise ProviderError(response.status_code in (400, 401, 403, 404, 422))
        result = response.json()
        if not isinstance(result, dict):
            raise ProviderError()
        return result
    except (requests.RequestException, ValueError):
        raise ProviderError()

async def call(method, path, body=None, params=None):
    return await run_in_threadpool(provider, method, path, body, params)

async def indexes(db):
    # The partial unique index excludes operations that do not yet have an Asaas id.
    await db.pix_deposits.create_index("provider_payment_id", unique=True,
        partialFilterExpression={"provider_payment_id": {"$type": "string"}})
    await db.pix_deposits.create_index([("user_id", 1), ("created_at", -1)])

def public(op):
    fields = ("id", "provider_payment_id", "amount_cents", "credited_cents", "status",
              "created_at", "paid_at", "expires_at", "qr_image", "pix_copy_paste")
    result = {k: op[k] for k in fields if k in op}
    if op["status"] != "pending":
        result.pop("qr_image", None)
        result.pop("pix_copy_paste", None)
    return result

def expired(op):
    try:
        date = datetime.fromisoformat(op["expires_at"].replace("Z", "+00:00"))
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone(timedelta(hours=-3)))
        return date <= now()
    except (KeyError, ValueError):
        return False

async def create_deposit(db, me, body):
    guard()
    await indexes(db)
    uid = me["user_id"]
    oid = hashlib.sha256((uid + ":" + body.idempotency_key).encode()).hexdigest()
    old = await db.pix_deposits.find_one({"_id": oid})
    if old:
        if old["amount_cents"] != body.amount_cents:
            raise HTTPException(409, "Esta solicitação já foi usada com outro valor")
        return public(old)
    # Persistent per-user creation lease prevents multiple tabs creating multiple charges.
    try:
        await db.pix_creation_locks.insert_one({"_id": uid, "operation_id": oid})
    except DuplicateKeyError:
        raise HTTPException(409, "Há um depósito em processamento. Atualize as movimentações.")
    op = {"_id": oid, "id": oid, "user_id": uid, "amount_cents": body.amount_cents,
          "status": "pending", "created_at": stamp(), "paid_at": None}
    try:
        await db.pix_deposits.insert_one(op)
    except DuplicateKeyError:
        return public(await db.pix_deposits.find_one({"_id": oid}))
    try:
        # CPF/CNPJ stays in memory and is sent only to Asaas; never stored in our ledger.
        customers = await call("GET", "/customers", params={"cpfCnpj": body.cpf_cnpj, "limit": 100})
        customer = next((c for c in customers.get("data", [])
                         if re.sub(r"\D", "", c.get("cpfCnpj", "")) == body.cpf_cnpj and not c.get("deleted")), None)
        if customer is None:
            customer = await call("POST", "/customers", {
                "name": me.get("name") or me.get("full_name") or "Cliente ServiçoJá",
                "cpfCnpj": body.cpf_cnpj, "notificationDisabled": True})
        customer_id = customer["id"]
        await db.pix_deposits.update_one({"_id": oid}, {"$set": {"customer_id": customer_id}})
        payment = await call("POST", "/payments", {
            "customer": customer_id, "billingType": "PIX", "value": body.amount_cents / 100,
            "dueDate": now().astimezone(timezone(timedelta(hours=-3))).date().isoformat(),
            "externalReference": oid, "description": "Depósito na carteira ServiçoJá"})
        pid = payment["id"]
        if not re.fullmatch(r"pay_[A-Za-z0-9_-]+", pid):
            raise ProviderError()
        # Persist the id BEFORE fetching QR. A QR failure must never recreate the charge.
        await db.pix_deposits.update_one({"_id": oid}, {"$set": {"provider_payment_id": pid}})
        await save_qr(db, oid, pid)
    except ProviderError as error:
        # An ambiguous network failure may have created a charge. Do not POST again.
        await db.pix_deposits.update_one({"_id": oid, "status": {"$ne": "paid"}},
            {"$set": {"status": "failed" if error.definitive and not (await db.pix_deposits.find_one({"_id": oid})).get("provider_payment_id") else "review"}})
    except (KeyError, TypeError):
        await db.pix_deposits.update_one({"_id": oid, "status": {"$ne": "paid"}}, {"$set": {"status": "review"}})
    result = await db.pix_deposits.find_one({"_id": oid})
    if result["status"] == "failed":
        await db.pix_creation_locks.delete_one({"_id": uid, "operation_id": oid})
    return public(result)

async def save_qr(db, oid, pid):
    qr = await call("GET", "/payments/" + pid + "/pixQrCode")
    if not all(isinstance(qr.get(k), str) and qr[k] for k in ("encodedImage", "payload", "expirationDate")):
        raise ProviderError()
    if len(qr["encodedImage"]) > 200000 or not re.fullmatch(r"[A-Za-z0-9+/=\r\n]+", qr["encodedImage"]) or len(qr["payload"]) > 5000:
        raise ProviderError()
    await db.pix_deposits.update_one({"_id": oid, "status": {"$in": ["pending", "review"]}},
        {"$set": {"qr_image": qr["encodedImage"], "pix_copy_paste": qr["payload"], "expires_at": qr["expirationDate"], "status": "pending"}})

async def reconcile(db, oid):
    op = await db.pix_deposits.find_one({"_id": oid})
    if not op:
        return
    pid = op.get("provider_payment_id")
    if not pid:
        # Recover an interrupted creation by its reference, without ever recreating it.
        found = await call("GET", "/payments", params={"externalReference": oid, "limit": 100})
        rows = found.get("data", [])
        if len(rows) != 1:
            return
        payment = rows[0]
        pid = payment.get("id", "")
        if not re.fullmatch(r"pay_[A-Za-z0-9_-]+", pid):
            return
    payment = await call("GET", "/payments/" + pid)
    valid = (payment.get("id") == pid and payment.get("externalReference") == oid
        and payment.get("customer") == op.get("customer_id") and payment.get("billingType") == "PIX"
        and money(payment.get("value")) == op["amount_cents"])
    status = payment.get("status")
    credited = 0
    if valid and status == "RECEIVED":
        credited = money(payment.get("netValue"))
        valid = 0 < credited <= op["amount_cents"]
    # CONFIRMED can mean a Pix precautionary hold. Credit only RECEIVED.
    target = "paid" if valid and status == "RECEIVED" else (
        "review" if not valid or status in ("REFUNDED", "REFUND_REQUESTED", "REFUND_IN_PROGRESS", "CHARGEBACK_REQUESTED", "CHARGEBACK_DISPUTE") else
        "failed" if payment.get("deleted") else "expired" if expired(op) else "pending")

    async def commit(session):
        current = await db.pix_deposits.find_one({"_id": oid}, session=session)
        if current.get("credited_cents") is not None:
            # Never un-credit or add funds twice. Flag refunds for manual reconciliation.
            if target == "review":
                await db.pix_deposits.update_one({"_id": oid}, {"$set": {"status": "review"}}, session=session)
            return
        changes = {"status": target, "provider_payment_id": pid, "provider_status": status, "checked_at": stamp()}
        if target == "paid":
            changes.update(credited_cents=credited, paid_at=payment.get("paymentDate") or payment.get("clientPaymentDate") or stamp())
            await db.pix_ledger.insert_one({"_id": pid, "user_id": op["user_id"], "deposit_id": oid,
                "amount_cents": credited, "counter_amount_cents": -credited, "created_at": stamp()}, session=session)
            await db.pix_balances.update_one({"_id": op["user_id"]},
                {"$inc": {"available_cents": credited}}, upsert=True, session=session)
        await db.pix_deposits.update_one({"_id": oid}, {"$set": changes}, session=session)
        if target in ("paid", "failed", "expired"):
            await db.pix_creation_locks.delete_one({"_id": op["user_id"], "operation_id": oid}, session=session)
    # with_transaction retries transient conflicts; commit ambiguity never repeats the ledger.
    # Atlas replica-set transactions are REQUIRED; there is deliberately no unsafe fallback.
    async with await db.client.start_session() as session:
        await session.with_transaction(commit)
    fresh = await db.pix_deposits.find_one({"_id": oid})
    if fresh["status"] == "pending" and not fresh.get("pix_copy_paste"):
        await save_qr(db, oid, pid)

async def snapshot(db, uid):
    balance = await db.pix_balances.find_one({"_id": uid}) or {}
    operations = await db.pix_deposits.find({"user_id": uid}).sort("created_at", -1).limit(50).to_list(50)
    return {"enabled": enabled(), "sandbox": False, "mode": "production", "withdrawals_enabled": False,
        "available_cents": balance.get("available_cents", 0), "operations": [public(o) for o in operations]}

async def synchronize(db, uid):
    # One provider refresh per user per 10 seconds, across serverless instances.
    try:
        await db.pix_sync.insert_one({"_id": uid, "next_at": now()})
    except DuplicateKeyError:
        pass
    acquired = await db.pix_sync.update_one({"_id": uid, "next_at": {"$lte": now()}},
        {"$set": {"next_at": now() + timedelta(seconds=10)}})
    if acquired.modified_count:
        rows = await db.pix_deposits.find({"user_id": uid, "status": {"$in": ["pending", "review", "expired"]}}).sort("created_at", -1).limit(5).to_list(5)
        for op in rows:
            await reconcile(db, op["_id"])

async def webhook(db, request):
    guard()
    token = request.headers.get("asaas-access-token", "")
    if not secrets.compare_digest(token.encode(), os.environ["ASAAS_WEBHOOK_TOKEN"].encode()):
        raise HTTPException(401, "Não autorizado")
    payload = bytearray()
    async for chunk in request.stream():
        payload.extend(chunk)
        if len(payload) > 65536:
            raise HTTPException(413, "Notificação muito grande")
    try:
        event = json.loads(payload)
        payment = event.get("payment", {})
        if not isinstance(payment, dict):
            raise ValueError()
        pid = payment.get("id")
        if not isinstance(pid, str) or not re.fullmatch(r"pay_[A-Za-z0-9_-]+", pid):
            return {"received": True}
        op = await db.pix_deposits.find_one({"provider_payment_id": pid})
        if not op and isinstance(payment.get("externalReference"), str):
            op = await db.pix_deposits.find_one({"_id": payment["externalReference"]})
        if op:
            # Ignore event financial fields. reconcile performs a fresh authenticated GET.
            await reconcile(db, op["_id"])
    except (ValueError, AttributeError):
        raise HTTPException(400, "Notificação inválida")
    except ProviderError:
        raise HTTPException(503, "Confirmação temporariamente indisponível")
    return {"received": True}

def build_router(db, onboarded):
    router = APIRouter(prefix="/api/wallet")
    @router.get("")
    async def wallet(me=Depends(onboarded)):
        if enabled():
            try:
                await synchronize(db, me["user_id"])
            except ProviderError:
                pass  # Keep last persisted state; never manufacture successful payments.
        return await snapshot(db, me["user_id"])

    @router.post("/deposits")
    async def deposit(body: DepositIn, me=Depends(onboarded)):
        return await create_deposit(db, me, body)

    @router.post("/sync")
    async def sync(me=Depends(onboarded)):
        guard()
        try:
            await synchronize(db, me["user_id"])
        except ProviderError:
            raise HTTPException(503, "Não foi possível consultar o pagamento agora")
        return await snapshot(db, me["user_id"])

    @router.post("/withdrawals")
    async def withdrawal(me=Depends(onboarded)):
        raise HTTPException(403, "Saques ainda não estão disponíveis")

    @router.post("/webhook")
    async def hook(request: Request):
        return await webhook(db, request)
    return router
