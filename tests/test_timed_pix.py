"""Timed Pix integration with isolated MongoDB and simulated provider receipts."""
import asyncio
import pytest
from datetime import datetime, timedelta, timezone

from tests.test_scaling import local_database


def test_three_codes_expire_and_delayed_receipt_credits_once(monkeypatch):
    from backend import production_wallet as wallet

    async def run():
        async with local_database(monkeypatch) as (_, db):
            start = datetime(2026, 11, 10, tzinfo=timezone.utc)
            second = 0
            codes = []
            monkeypatch.setattr(wallet, "guard", lambda: None)
            monkeypatch.setattr(wallet, "now", lambda: start + timedelta(seconds=second))

            async def provider(method, path, body=None, params=None):
                if path == "/pix/addressKeys":
                    return {"data":[{"key":"test","status":"ACTIVE"}]}
                if path == "/payments":
                    return {"data":[]}
                if path == "/payments/pay_abc":
                    return {"id":"pay_abc","pixQrCodeId":codes[0],"billingType":"PIX",
                            "status":"RECEIVED","value":10,"netValue":9}
                assert method == "POST" and path == "/pix/qrCodes/static"
                assert body["allowsMultiplePayments"] is False and body["value"] == 10
                codes.append("code-" + str(len(codes)))
                return {"id":codes[-1],"encodedImage":"YQ==","payload":codes[-1]}

            monkeypatch.setattr(wallet, "call", provider)
            body = wallet.DepositIn(amount_cents=1000, cpf_cnpj="24971563792", idempotency_key="test-session-123456")
            first = await wallet.create_timed(db, {"user_id":"pro"}, body)
            oid = first["id"]
            for second in [58,59,118,177,180]:
                op = await db.pix_deposits.find_one({"_id":oid})
                view = await wallet.timed_code(db, op)
                if second < 177:
                    assert view["pix_copy_paste"] == codes[second // 59]
                else:
                    assert "pix_copy_paste" not in view
            assert view["status"] == "expired" and len(codes) == 3
            assert not await db.pix_creation_locks.find_one({"_id":"pro"})
            assert not await db.pix_balances.find_one({"_id":"pro"})
            for _ in range(2):
                await wallet.collect_timed(db, op, "pay_abc")
            assert (await db.pix_balances.find_one({"_id":"pro"}))["available_cents"] == 900
            assert await db.pix_ledger.count_documents({}) == 1
    asyncio.run(run())


@pytest.mark.parametrize("stage,definitive,expected_posts", [("lookup", False, 1), ("post", True, 2), ("post", False, 1)])
def test_code_failure_retries_only_when_safe(monkeypatch, stage, definitive, expected_posts):
    from backend import production_wallet as wallet

    async def run():
        async with local_database(monkeypatch) as (_, db):
            monkeypatch.setattr(wallet, "guard", lambda: None)
            start = datetime.now(timezone.utc)
            monkeypatch.setattr(wallet, "now", lambda: start)
            calls = {"lookup": 0, "post": 0}

            async def provider(method, path, body=None, params=None):
                kind = "lookup" if method == "GET" else "post"
                calls[kind] += 1
                if kind == stage and calls[kind] == 1:
                    raise wallet.ProviderError(definitive)
                if kind == "lookup":
                    return {"data": [{"key": "test", "status": "ACTIVE"}]}
                return {"id": "code-safe", "encodedImage": "YQ==", "payload": "PIX"}

            monkeypatch.setattr(wallet, "call", provider)
            body = wallet.DepositIn(amount_cents=1000, cpf_cnpj="24971563792", idempotency_key="recover-session-1234")
            with pytest.raises(wallet.ProviderError):
                await wallet.create_timed(db, {"user_id": "pro"}, body)
            result = await wallet.create_timed(db, {"user_id": "pro"}, body)
            assert calls["post"] == expected_posts
            assert bool(result.get("pix_copy_paste")) == (stage == "lookup" or definitive)
            assert await db.pix_deposits.count_documents({}) == 1
            assert await db.pix_balances.count_documents({}) == 0
    asyncio.run(run())


def test_reconciliation_collects_all_receipts_without_duplicate_credit(monkeypatch):
    from backend import production_wallet as wallet

    async def run():
        async with local_database(monkeypatch) as (_, db):
            op = {"_id":"multiple", "id":"multiple", "user_id":"pro", "amount_cents":1000,
                  "created_at":wallet.stamp(), "status":"pending", "timed":True, "qr_ids":["qr-a", "qr-b"]}
            await db.pix_deposits.insert_one(op)
            async def provider(method, path, body=None, params=None):
                if path == "/payments":
                    qr = params["pixQrCodeId"]
                    return {"data":[{"id":"pay_" + qr[-1], "pixQrCodeId":qr}]}
                return {"id":path.split("/")[-1], "pixQrCodeId":"qr-" + path[-1], "billingType":"PIX",
                        "status":"RECEIVED", "value":10, "netValue":9}
            monkeypatch.setattr(wallet, "call", provider)
            assert await wallet.timed_receipts(db, op)
            assert await wallet.timed_receipts(db, op)
            assert (await db.pix_balances.find_one({"_id":"pro"}))["available_cents"] == 1800
            assert await db.pix_ledger.count_documents({}) == 2
    asyncio.run(run())
