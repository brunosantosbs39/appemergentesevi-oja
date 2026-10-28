import copy
import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
from backend import production_wallet as w

def run(c):
    try:
        c.send(None)
    except StopIteration as e:
        return e.value
    raise AssertionError("Unexpected IO in memory test")

def match(doc, query):
    for key, value in query.items():
        got = doc.get(key)
        if isinstance(value, dict):
            if "$ne" in value and got == value["$ne"]: return False
            if "$in" in value and got not in value["$in"]: return False
            if "$lte" in value and got > value["$lte"]: return False
        elif got != value:
            return False
    return True

class Collection:
    def __init__(self):
        self.docs = {}
        self.fail = False
    async def create_index(self, *args, **kw): pass
    async def find_one(self, q, **kw):
        return next((copy.deepcopy(d) for d in self.docs.values() if match(d, q)), None)
    async def insert_one(self, d, **kw):
        if self.fail: raise RuntimeError("injected database failure")
        if d["_id"] in self.docs: raise DuplicateKeyError("duplicate")
        self.docs[d["_id"]] = copy.deepcopy(d)
    async def update_one(self, q, update, upsert=False, **kw):
        if self.fail: raise RuntimeError("injected database failure")
        current = next((d for d in self.docs.values() if match(d, q)), None)
        if current is None:
            if not upsert: return SimpleNamespace(modified_count=0)
            current = dict(q); self.docs[current["_id"]] = current
        current.update(update.get("$set", {}))
        for k, n in update.get("$inc", {}).items(): current[k] = current.get(k, 0) + n
        return SimpleNamespace(modified_count=1)
    async def delete_one(self, q, **kw):
        for key, d in list(self.docs.items()):
            if match(d, q): del self.docs[key]

class Session:
    def __init__(self, db): self.db = db
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass
    async def with_transaction(self, fn):
        saved = {k: copy.deepcopy(v.docs) for k, v in vars(self.db).items() if isinstance(v, Collection)}
        try:
            await fn(self)
        except Exception:
            for k, d in saved.items(): getattr(self.db, k).docs = d
            raise

def database():
    db = SimpleNamespace(**{n: Collection() for n in ("pix_deposits", "pix_balances", "pix_ledger", "pix_creation_locks")})
    db.client = SimpleNamespace(start_session=AsyncMock(side_effect=lambda: Session(db)))
    return db

def req(data, token="t"*40):
    async def stream(): yield json.dumps(data).encode()
    return SimpleNamespace(headers={"asaas-access-token": token}, stream=stream)

@patch.dict(os.environ, {"ASAAS_PRODUCTION_ENABLED": "true", "ASAAS_API_KEY": "unit-test-only", "ASAAS_WEBHOOK_TOKEN": "t"*40})
class PixTests(unittest.TestCase):
    def setUp(self):
        self.db = database()
        self.body = w.DepositIn(amount_cents=1000, cpf_cnpj="24971563792", idempotency_key="intent-1234567890")
        self.me = {"user_id": "alice", "name": "Alice"}
    def seed(self):
        op = {"_id": "op", "id": "op", "user_id": "alice", "amount_cents": 1000, "status": "pending",
              "provider_payment_id": "pay_123", "customer_id": "cus_1", "created_at": w.stamp()}
        self.db.pix_deposits.docs["op"] = op
        self.db.pix_creation_locks.docs["alice"] = {"_id": "alice", "operation_id": "op"}
        return op
    def payment(self, **kw):
        return dict({"id": "pay_123", "externalReference": "op", "customer": "cus_1", "billingType": "PIX",
            "value": 10, "netValue": 9.01, "status": "RECEIVED", "paymentDate": "2026-10-28"}, **kw)
    def reconcile(self, **kw):
        with patch.object(w, "call", AsyncMock(return_value=self.payment(**kw))):
            run(w.reconcile(self.db, "op"))
    def test_create_reuses_customer_and_does_not_credit(self):
        responses = [{"data": [{"id": "cus_1", "cpfCnpj": "24971563792"}]}, {"id": "pay_123"},
                     {"encodedImage": "YWJj", "payload": "PIX-CODE", "expirationDate": "2026-12-31 23:59:59"}]
        with patch.object(w, "call", AsyncMock(side_effect=responses)) as api:
            created = run(w.create_deposit(self.db, self.me, self.body))
            again = run(w.create_deposit(self.db, self.me, self.body))
            self.assertEqual(api.await_count, 3)
            self.assertEqual(api.await_args_list[1].args[:2], ("POST", "/payments"))
            self.assertEqual(created, again)
        self.assertEqual(created["status"], "pending")
        self.assertEqual(created["pix_copy_paste"], "PIX-CODE")
        self.assertEqual(self.db.pix_balances.docs, {})
        self.assertEqual(self.db.pix_ledger.docs, {})
        self.assertNotIn("cpf_cnpj", next(iter(self.db.pix_deposits.docs.values())))
    def test_create_customer_when_missing(self):
        replies = [{"data": []}, {"id": "cus_1"}, {"id": "pay_123"},
                   {"encodedImage": "YWJj", "payload": "PIX", "expirationDate": "2026-12-31"}]
        with patch.object(w, "call", AsyncMock(side_effect=replies)) as api:
            run(w.create_deposit(self.db, self.me, self.body))
            self.assertEqual(api.await_args_list[1].args[:2], ("POST", "/customers"))
    def test_ambiguous_creation_is_review_no_retry(self):
        with patch.object(w, "call", AsyncMock(side_effect=w.ProviderError())) as api:
            op = run(w.create_deposit(self.db, self.me, self.body))
            run(w.create_deposit(self.db, self.me, self.body))
            self.assertEqual(api.await_count, 1)
        self.assertEqual(op["status"], "review")
        self.assertFalse(self.db.pix_balances.docs)
    def test_qr_failure_preserves_payment_id(self):
        with patch.object(w, "call", AsyncMock(side_effect=[{"data": [{"id": "cus_1", "cpfCnpj": "24971563792"}]},
                                                           {"id": "pay_123"}, w.ProviderError()])):
            op = run(w.create_deposit(self.db, self.me, self.body))
        self.assertEqual(op["provider_payment_id"], "pay_123")
        self.assertEqual(op["status"], "review")
    def test_paid_exactly_once(self):
        self.seed()
        self.reconcile()
        self.reconcile()
        self.assertEqual(self.db.pix_balances.docs["alice"]["available_cents"], 901)
        self.assertEqual(len(self.db.pix_ledger.docs), 1)
        self.assertEqual(self.db.pix_deposits.docs["op"]["paid_at"], "2026-10-28")
        self.assertEqual(self.db.pix_deposits.docs["op"]["status"], "paid")
    def test_credit_rolls_back_with_status_failure(self):
        self.seed()
        self.db.pix_deposits.fail = True
        with self.assertRaises(RuntimeError): self.reconcile()
        self.assertFalse(self.db.pix_balances.docs)
        self.assertFalse(self.db.pix_ledger.docs)
        self.db.pix_deposits.fail = False
        self.reconcile()
        self.assertEqual(self.db.pix_balances.docs["alice"]["available_cents"], 901)
    def test_confirmed_precautionary_hold_no_credit(self):
        self.seed()["pix_copy_paste"] = "PIX"
        self.reconcile(status="CONFIRMED")
        self.assertEqual(self.db.pix_deposits.docs["op"]["status"], "pending")
        self.assertFalse(self.db.pix_balances.docs)
    def test_mismatched_fields_require_review(self):
        for fields in ({"value": 11}, {"customer": "other"}, {"externalReference": "other"},
                       {"id": "pay_wrong"}, {"billingType": "BOLETO"}, {"netValue": 11}, {"netValue": -1}):
            self.db = database(); self.seed(); self.reconcile(**fields)
            self.assertEqual(self.db.pix_deposits.docs["op"]["status"], "review")
            self.assertFalse(self.db.pix_balances.docs)
    def test_invalid_webhook_token_denies_provider_call(self):
        with patch.object(w, "call", AsyncMock()) as api:
            with self.assertRaises(HTTPException) as error:
                run(w.webhook(self.db, req({}, "incorrect")))
            self.assertEqual(error.exception.status_code, 401)
            api.assert_not_awaited()
    def test_webhook_rechecks_authoritative_payment(self):
        self.seed()["pix_copy_paste"] = "PIX"
        with patch.object(w, "call", AsyncMock(return_value=self.payment(status="PENDING"))) as api:
            run(w.webhook(self.db, req({"payment": self.payment()})))
            api.assert_awaited_once_with("GET", "/payments/pay_123")
        self.assertFalse(self.db.pix_balances.docs)
    def test_webhook_duplicate_credits_once(self):
        self.seed()
        with patch.object(w, "call", AsyncMock(return_value=self.payment())):
            for _ in range(3):
                run(w.webhook(self.db, req({"payment": {"id": "pay_123"}})))
        self.assertEqual(len(self.db.pix_ledger.docs), 1)
        self.assertEqual(self.db.pix_balances.docs["alice"]["available_cents"], 901)
    def test_webhook_outage_returns_retryable_error(self):
        self.seed()
        with patch.object(w, "call", AsyncMock(side_effect=w.ProviderError())):
            with self.assertRaises(HTTPException) as error:
                run(w.webhook(self.db, req({"payment": {"id": "pay_123"}})))
        self.assertEqual(error.exception.status_code, 503)
    def test_expired_can_be_received_later(self):
        self.seed().update(expires_at="2000-01-01", pix_copy_paste="PIX")
        self.reconcile(status="PENDING")
        self.assertEqual(self.db.pix_deposits.docs["op"]["status"], "expired")
        self.reconcile()
        self.assertEqual(self.db.pix_deposits.docs["op"]["status"], "paid")
    def test_refund_flags_review_never_credits_twice(self):
        self.seed(); self.reconcile(); self.reconcile(status="REFUNDED"); self.reconcile()
        self.assertEqual(self.db.pix_deposits.docs["op"]["status"], "review")
        self.assertEqual(self.db.pix_balances.docs["alice"]["available_cents"], 901)
    def test_late_pending_cannot_downgrade_paid(self):
        self.seed(); self.reconcile(); self.reconcile(status="PENDING")
        self.assertEqual(self.db.pix_deposits.docs["op"]["status"], "paid")
    def test_production_gate_fail_closed(self):
        with patch.dict(os.environ, {"ASAAS_PRODUCTION_ENABLED": "false"}):
            self.assertFalse(w.enabled())
        with patch.dict(os.environ, {"ASAAS_API_KEY": "fake-hmlg-key"}):
            self.assertFalse(w.enabled())
        with patch.dict(os.environ, {"ASAAS_WEBHOOK_TOKEN": ""}):
            self.assertFalse(w.enabled())
    def test_invalid_documents_and_amounts(self):
        for cpf in ("00000000000", "12345678901", "abc24971563792"):
            with self.assertRaises(ValidationError): self.body.model_validate({**self.body.model_dump(), "cpf_cnpj": cpf})
        for amount in (True, 499, 10001, 5.5):
            with self.assertRaises(ValidationError): self.body.model_validate({**self.body.model_dump(), "amount_cents": amount})
    def test_withdrawals_always_forbidden(self):
        router = w.build_router(self.db, lambda: self.me)
        route = next(r for r in router.routes if r.path.endswith("/withdrawals"))
        with self.assertRaises(HTTPException) as error: run(route.endpoint(self.me))
        self.assertEqual(error.exception.status_code, 403)

if __name__ == "__main__":
    unittest.main()
