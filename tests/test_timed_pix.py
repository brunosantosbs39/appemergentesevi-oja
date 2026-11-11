"""Timed Pix integration with isolated MongoDB and simulated provider receipts."""
import asyncio
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
