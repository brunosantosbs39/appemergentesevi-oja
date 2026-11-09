import copy
import os
import unittest
from uuid import uuid4

from fastapi import HTTPException
from backend.pricing import present_message, present_request, client_quote, worker_offer
from backend import service_funds
from backend.completion import confirm_completion


class Quotes(unittest.TestCase):
    def test_offer_and_counterproposal_are_personalized(self):
        request = {"pricing_version": 1, "client_id":"owner", "budget":100, "unit_cents":10000,
                   "agreed_budget":110, "agreed_net_cents":10000,
                   "applications":[{"negotiated_budget":110, "quote_net_cents":10000}]}
        for uid, expected in [("owner",(100,110)), ("worker",(90,100))]:
            view = present_request(copy.deepcopy(request), uid)
            self.assertEqual((view["budget"],view["agreed_budget"]), expected)
            self.assertEqual(view["applications"][0]["negotiated_budget"], expected[1])
            self.assertNotIn("quote_net_cents",view["applications"][0])
        message = {"sender_id":"worker","proposal":{"amount":100,"client_cents":11000}}
        for uid, expected in [("owner",110), ("worker",100)]:
            self.assertEqual(present_message(copy.deepcopy(message), uid)["proposal"],{"amount":expected})
        self.assertEqual(client_quote(10000),11000)
        self.assertEqual(worker_offer(10000),9000)
        self.assertEqual(present_request({"budget":100}, "worker")["budget"],100)


@unittest.skipUnless(os.getenv("FEE_TEST_MONGO"), "requires a disposable replica set")
class Settlement(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        from motor.motor_asyncio import AsyncIOMotorClient
        self.client = AsyncIOMotorClient(os.environ["FEE_TEST_MONGO"],serverSelectionTimeoutMS=8000)
        self.db = self.client["fee_test_" + uuid4().hex]
        await self.db.requests.insert_one({"id":"job","status":"pendente","client_id":"a"})
        await self.db.pix_balances.insert_one({"_id":"a","available_cents":11000})

    async def asyncTearDown(self):
        await self.client.drop_database(self.db.name)
        self.client.close()

    async def approve(self, gross, net):
        return await service_funds.approve(self.db, {"id":"job","status":"pendente"},
            {"status":"aceito","professional_id":"b"}, gross, net, "now")

    async def test_counteroffer_checkout_and_duplicate_confirmation(self):
        await self.approve(11000,10000)
        await self.db.requests.update_one({"id":"job"},{"$set":{"status":"concluido","check_out_at":"now"}})
        for uid in ["a","b","a","b"]:
            await service_funds.settle(self.db,"job",uid,"now",confirm_completion)
        self.assertEqual((await self.db.pix_balances.find_one({"_id":"b"}))["available_cents"],10000)
        self.assertEqual((await self.db.pix_ledger.find_one({"kind":"platform_commission"}))["amount_cents"],1000)
        self.assertEqual(await self.db.pix_ledger.count_documents({}),3)

    async def test_insufficient_balance_rolls_back_and_refund_only_once(self):
        with self.assertRaises(HTTPException):
            await self.approve(12000,10800)
        self.assertEqual((await self.db.requests.find_one())["status"],"pendente")
        await self.approve(10000,9000)
        for _ in range(2):
            await service_funds.refund(self.db,{"id":"job","status":"aceito"},{"status":"cancelado"},"now")
        self.assertEqual((await self.db.pix_balances.find_one({"_id":"a"}))["available_cents"],11000)
        self.assertEqual(await self.db.pix_ledger.count_documents({}),2)
