"""Real Pix deposits, isolated from the sandbox. All money writes use Mongo transactions."""
import hashlib
import json
import os
import re
import secrets
from datetime import datetime, timezone, timedelta
from decimal import Decimal, InvalidOperation
from typing import Literal

import requests
from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

try:
    from backend.jobs import pending as pending_job, safe_drain
except ModuleNotFoundError:
    from jobs import pending as pending_job, safe_drain

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
    await db.pix_deposits.create_index([("status", 1), ("paid_at", -1)])
    await db.pix_withdrawals.create_index([("user_id", 1), ("created_at", -1)])
    await db.pix_ledger.create_index([("user_id", 1), ("created_at", -1)])
    await db.requests.create_index([("professional_id", 1), ("service_fund.status", 1), ("status", 1)])
    await db.pix_withdrawals.create_index("transfer_id", unique=True,
        partialFilterExpression={"transfer_id": {"$type": "string"}})

def public(op):
    fields = ("id", "provider_payment_id", "amount_cents", "credited_cents", "status",
              "created_at", "paid_at", "expires_at", "qr_image", "pix_copy_paste", "quoted_net_cents")
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
    uid = me["user_id"]
    oid = hashlib.sha256((uid + ":" + body.idempotency_key).encode()).hexdigest()
    old = await db.pix_deposits.find_one({"_id": oid})
    if old:
        if old["amount_cents"] != body.amount_cents:
            raise HTTPException(409, "Esta solicitação já foi usada com outro valor")
        return public(old)
    # Create the intent and lock atomically: a process crash cannot leave an ownerless lock.
    op = {"_id": oid, "id": oid, "user_id": uid, "amount_cents": body.amount_cents,
          "status": "pending", "creation_stage": "preparing", "created_at": stamp(),
          "prepare_until": now() + timedelta(minutes=2), "paid_at": None, "sync_job": pending_job()}
    async def reserve(session):
        await db.pix_creation_locks.insert_one({"_id": uid, "operation_id": oid}, session=session)
        await db.pix_deposits.insert_one(op, session=session)
    try:
        async with await db.client.start_session() as session:
            await session.with_transaction(reserve)
    except DuplicateKeyError:
        old = await db.pix_deposits.find_one({"_id": oid})
        if old and old["amount_cents"] == body.amount_cents:
            return public(old)
        raise HTTPException(409, "Há um depósito em processamento. Atualize as movimentações.")
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
        # A stale preparing intent can be cancelled by recovery. This CAS fences the
        # old creator BEFORE its irreversible POST, even if it resumes after expiry.
        transition = await db.pix_deposits.update_one(
            {"_id": oid, "creation_stage": "preparing", "status": "pending"},
            {"$set": {"customer_id": customer_id, "creation_stage": "submitting"}})
        if not transition.modified_count:
            return public(await db.pix_deposits.find_one({"_id": oid}))

        payment = await call("POST", "/payments", {
            "customer": customer_id, "billingType": "PIX", "value": body.amount_cents / 100,
            "dueDate": now().astimezone(timezone(timedelta(hours=-3))).date().isoformat(),
            "externalReference": oid, "description": "Depósito na carteira ServiçoJá"})
        pid = payment["id"]
        if not re.fullmatch(r"pay_[A-Za-z0-9_-]+", pid):
            raise ProviderError()
        # Persist the id BEFORE fetching QR. A QR failure must never recreate the charge.
        created = {"provider_payment_id": pid, "creation_stage": "created"}
        if payment.get("netValue") is not None:
            try:
                quoted = money(payment["netValue"])
                if 0 <= quoted <= body.amount_cents:
                    created["quoted_net_cents"] = quoted
            except HTTPException:
                pass  # Missing price information must not prevent recovery of the payment ID.
        await db.pix_deposits.update_one({"_id": oid}, {"$set": created})
        await save_qr(db, oid, pid)
    except (ProviderError, KeyError, TypeError) as error:
        current = await db.pix_deposits.find_one({"_id": oid})
        # No payment POST can have happened in preparing. Ambiguous POSTs remain
        # blocked for reconciliation; never infer absence from a timeout or empty list.
        safe = current.get("creation_stage") == "preparing" or (
            isinstance(error, ProviderError) and error.definitive and not current.get("provider_payment_id"))
        await db.pix_deposits.update_one({"_id": oid, "status": {"$nin": ["paid", "failed"]}},
            {"$set": {"status": "failed" if safe else "review"}})
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
    if op.get("creation_stage") == "preparing":
        if op["status"] == "failed":
            await db.pix_creation_locks.delete_one({"_id": op["user_id"], "operation_id": oid})
            return
        if op.get("prepare_until") and op["prepare_until"].replace(tzinfo=timezone.utc) <= now():
            await db.pix_deposits.update_one(
                {"_id": oid, "creation_stage": "preparing", "status": "pending"},
                {"$set": {"status": "failed", "failure_reason": "preparation_interrupted"}})
            fresh = await db.pix_deposits.find_one({"_id": oid})
            if fresh["status"] == "failed":
                await db.pix_creation_locks.delete_one({"_id": op["user_id"], "operation_id": oid})
        return
    if op["status"] == "failed" and not op.get("provider_payment_id"):
        await db.pix_creation_locks.delete_one({"_id": op["user_id"], "operation_id": oid})
        return
    pid = op.get("provider_payment_id")
    if not pid:
        # Recover an interrupted creation by its reference, without ever recreating it.
        found = await call("GET", "/payments", params={"externalReference": oid, "limit": 100})
        rows = found.get("data", [])
        if len(rows) != 1:
            await db.pix_deposits.update_one({"_id": oid, "credited_cents": {"$exists": False}},
                {"$set": {"status": "review", "checked_at": stamp()}})
            return
        payment = rows[0]
        pid = payment.get("id", "")
        if not re.fullmatch(r"pay_[A-Za-z0-9_-]+", pid):
            return
    payment = await call("GET", "/payments/" + pid)
    valid = (not payment.get("deleted") and payment.get("id") == pid and payment.get("externalReference") == oid
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
    withdrawals = await db.pix_withdrawals.find({"user_id": uid}).sort("created_at", -1).limit(50).to_list(50)
    last_paid = await db.pix_deposits.find_one({"status":"paid", "credited_cents":{"$exists":True}},
        {"amount_cents":1, "credited_cents":1}, sort=[("paid_at",-1)])
    fee_estimate = last_paid["amount_cents"] - last_paid["credited_cents"] if last_paid else None
    service_entries = await db.pix_ledger.find({"user_id": uid, "kind": {"$in": [
        "service_income", "service_refund", "service_reserve"]}}, {"_id":1, "kind":1, "amount_cents":1, "created_at":1}
        ).sort("created_at", -1).limit(50).to_list(50)
    pending = await db.requests.aggregate([
        {"$match": {"professional_id":uid, "status":{"$in":["em_andamento","concluido"]}, "service_fund.status":"reserved"}},
        {"$group": {"_id":None, "total":{"$sum":"$service_fund.net"}}}]).to_list(1)
    return {"enabled": enabled(), "sandbox": False, "mode": "production", "withdrawals_enabled": enabled(),
        "withdrawals": [public_transfer(w) for w in withdrawals], "deposit_fee_estimate_cents": fee_estimate,
        "service_entries": service_entries, "pending_cents": pending[0]["total"] if pending else 0,
        "available_cents": balance.get("available_cents", 0), "operations": [public(o) for o in operations]}

async def synchronize(db, uid):
    # Backfill legacy active intents, but never POST another provider charge.
    await db.pix_deposits.update_many(
        {"user_id": uid, "status": {"$in": ["pending", "review"]}, "sync_job": {"$exists": False}},
        {"$set": {"sync_job": pending_job()}})

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
        if isinstance(event.get("transfer"), dict):
            incoming = event["transfer"]
            await check_transfer(db, incoming.get("externalReference"), incoming.get("id"))
            return {"received": True}
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

class WithdrawalIn(BaseModel):
    amount_cents: int = Field(strict=True, gt=0, le=10000)
    pix_type: Literal["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"] = "EVP"
    pix_key: str = Field(min_length=1, max_length=254)

    @field_validator("pix_key")
    @classmethod
    def normalize_key(cls, value, info):
        key = value.strip()
        kind = info.data.get("pix_type")
        if kind in ("CPF", "CNPJ"):
            digits = document(key)
            if len(digits) == (11 if kind == "CPF" else 14):
                return digits
        elif kind == "PHONE":
            digits = re.sub(r"[ ()-]", "", key).removeprefix("+55")
            if re.fullmatch(r"[0-9]{11}", digits):
                return digits
        elif kind == "EMAIL" and re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", key):
            return key.lower()
        elif kind == "EVP" and re.fullmatch(r"[\da-fA-F]{8}(?:-[\da-fA-F]{4}){3}-[\da-fA-F]{12}", key):
            return key.lower()
        raise ValueError("Chave inválida para o tipo selecionado")
    idempotency_key: str = Field(min_length=16, max_length=80, pattern=r"^[A-Za-z0-9-]+$")

def public_transfer(op):
    return {field: op[field] for field in ("id", "amount_cents", "status", "created_at")}

async def finish_transfer(db, op, status):
    async def finish(session):
        changed = await db.pix_withdrawals.update_one(
            {"_id": op["_id"], "status": {"$in": ["pending", "review"]}},
            {"$set": {"status": status, "updated_at": stamp()}}, session=session)
        if not changed.modified_count:
            return
        if status == "failed":
            await db.pix_balances.update_one({"_id": op["user_id"]},
                {"$inc": {"available_cents": op["amount_cents"]}}, session=session)
            await record_transfer_entry(db, op, "refund", op["amount_cents"], session)
        await db.pix_withdrawal_locks.delete_one({"_id": op["user_id"], "operation_id": op["_id"]}, session=session)
    async with await db.client.start_session() as session:
        await session.with_transaction(finish)

async def record_transfer_entry(db, op, kind, amount, session):
    await db.pix_ledger.insert_one({"_id": f"withdraw-{kind}-{op['id']}", "user_id": op["user_id"],
        "withdrawal_id": op["id"], "amount_cents": amount, "counter_amount_cents": -amount,
        "created_at": stamp()}, session=session)

async def check_transfer(db, oid, tid):
    if not isinstance(oid, str) or not isinstance(tid, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", tid):
        return
    op = await db.pix_withdrawals.find_one({"_id": oid, "status": {"$in": ["pending", "review"]}})
    if not op or op.get("transfer_id", tid) != tid:
        return
    record = await call("GET", "/transfers/" + tid)
    if record.get("externalReference") != oid or record.get("id") != tid or money(record.get("value")) != op["amount_cents"]:
        await db.pix_withdrawals.update_one({"_id": oid, "status": "pending"}, {"$set": {"status": "review"}})
        return
    await db.pix_withdrawals.update_one({"_id": oid}, {"$set": {"transfer_id": tid}})
    if record.get("status") == "DONE":
        await finish_transfer(db, op, "done")
    elif record.get("status") in ("FAILED", "CANCELLED"):
        await finish_transfer(db, op, "failed")

async def create_transfer(db, uid, body):
    guard()
    key = body.pix_key.lower()
    fingerprint = hashlib.sha256(key.encode()).hexdigest()
    oid = hashlib.sha256(f"withdraw:{uid}:{body.idempotency_key}".encode()).hexdigest()
    op = {"_id": oid, "id": oid, "user_id": uid, "amount_cents": body.amount_cents,
          "destination_hash": fingerprint, "pix_type": body.pix_type, "status": "pending", "created_at": stamp()}
    async def reserve(session):
        if await db.pix_deposits.find_one({"user_id": uid, "status": "review", "credited_cents": {"$exists": True}}, session=session):
            raise HTTPException(409, "Há um crédito em análise. Aguarde a revisão.")
        await db.pix_withdrawals.insert_one(op, session=session)
        await db.pix_withdrawal_locks.insert_one({"_id": uid, "operation_id": oid}, session=session)
        result = await db.pix_balances.update_one(
            {"_id": uid, "available_cents": {"$gte": body.amount_cents}},
            {"$inc": {"available_cents": -body.amount_cents}}, session=session)
        if not result.modified_count:
            raise HTTPException(409, "Saldo disponível insuficiente.")
        await record_transfer_entry(db, op, "reserve", -body.amount_cents, session)
    try:
        async with await db.client.start_session() as session:
            await session.with_transaction(reserve)
    except DuplicateKeyError:
        previous = await db.pix_withdrawals.find_one({"_id": oid})
        if (previous and previous["amount_cents"] == body.amount_cents and previous["destination_hash"] == fingerprint
                and previous.get("pix_type", "EVP") == body.pix_type):
            return public_transfer(previous)
        raise HTTPException(409, "Confira o saque anterior antes de solicitar outro.")
    try:
        transfer = await call("POST", "/transfers", {"value": body.amount_cents / 100,
            "pixAddressKey": key, "pixAddressKeyType": body.pix_type, "externalReference": oid})
    except ProviderError as error:
        if error.definitive:
            await finish_transfer(db, op, "failed")
        else:
            await db.pix_withdrawals.update_one({"_id": oid, "status": "pending"}, {"$set": {"status": "review"}})
    else:
        tid = transfer.get("id")
        if isinstance(tid, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,100}", tid):
            await db.pix_withdrawals.update_one({"_id": oid}, {"$set": {"transfer_id": tid}})
            try:
                await check_transfer(db, oid, tid)
            except ProviderError:
                pass  # The wallet refresh and webhook both retry the read, never the transfer.
        else:
            await db.pix_withdrawals.update_one({"_id": oid, "status": "pending"}, {"$set": {"status": "review"}})
    return public_transfer(await db.pix_withdrawals.find_one({"_id": oid}))

async def refresh_transfer(db, uid):
    lock = await db.pix_withdrawal_locks.find_one({"_id": uid})
    if not lock:
        return
    op = await db.pix_withdrawals.find_one({"_id": lock["operation_id"]})
    if not op:
        return
    try:
        tid = op.get("transfer_id")
        if not tid:
            # A lost POST response must never trigger a second POST. Allow one
            # recovery lookup per minute, including gaps before the first webhook.
            lease = await db.pix_withdrawals.update_one({"_id": op["id"], "$or": [
                {"next_lookup": {"$exists": False}}, {"next_lookup": {"$lte": now()}}]},
                {"$set": {"next_lookup": now() + timedelta(minutes=1)}})
            if not lease.modified_count:
                return
            recent = await call("GET", "/transfers", params={"limit": 100})
            matches = [t for t in recent.get("data", []) if t.get("externalReference") == op["id"]]
            if len(matches) != 1:
                return
            tid = matches[0].get("id")
        await check_transfer(db, op["id"], tid)
    except ProviderError:
        pass

def build_router(db, onboarded):
    router = APIRouter(prefix="/api/wallet")
    @router.get("")
    async def wallet(background_tasks: BackgroundTasks, me=Depends(onboarded)):
        if enabled():
            try:
                await synchronize(db, me["user_id"])
                background_tasks.add_task(safe_drain, db)
                background_tasks.add_task(refresh_transfer, db, me["user_id"])
            except ProviderError:
                pass  # Keep last persisted state; never manufacture successful payments.
        return await snapshot(db, me["user_id"])

    @router.post("/deposits")
    async def deposit(body: DepositIn, me=Depends(onboarded)):
        return await create_deposit(db, me, body)

    @router.post("/sync")
    async def sync(background_tasks: BackgroundTasks, me=Depends(onboarded)):
        guard()
        try:
            await synchronize(db, me["user_id"])
            background_tasks.add_task(safe_drain, db)
        except ProviderError:
            raise HTTPException(503, "Não foi possível consultar o pagamento agora")
        return await snapshot(db, me["user_id"])

    @router.post("/withdrawals")
    async def withdrawal(body: WithdrawalIn, me=Depends(onboarded)):
        return await create_transfer(db, me["user_id"], body)

    @router.post("/webhook")
    async def hook(request: Request):
        return await webhook(db, request)
    return router
