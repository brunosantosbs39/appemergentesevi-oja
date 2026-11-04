import copy
import os
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from fastapi import HTTPException
from pydantic import ValidationError
from backend import sandbox_wallet as w


def run(c):
    try: c.send(None)
    except StopIteration as e: return e.value
    raise AssertionError('Unexpected IO in in-memory test')

class Memory:
    def __init__(self): self.doc=w.initial();self.conflict=False
    async def find_one(self,query): return copy.deepcopy(self.doc)
    async def replace_one(self,query,after):
        if self.conflict:
            self.conflict=False;self.doc['version']+=1
            return SimpleNamespace(modified_count=0)
        if self.doc['version']!=query['version']: return SimpleNamespace(modified_count=0)
        self.doc=copy.deepcopy(after);return SimpleNamespace(modified_count=1)

class WalletTests(unittest.TestCase):
    def setUp(self):
        self.mem=Memory()
        self.db=SimpleNamespace(sandbox_wallet_state=self.mem,requests=SimpleNamespace(find_one=AsyncMock(return_value={'id':'job','client_id':'client','professional_id':'pro','status':'concluido','check_out_at':'today'})))
        self.amount=w.AmountIn(amount_cents=1000,idempotency_key='request-123456789')
    def seed(self,uid='client',amount=5000): w.post(self.mem.doc,uid,amount,'seed','seed')
    def fund(self):
        self.seed();run(w.fund_service(self.db,'job','client',1000))
    def test_amount_validation(self):
        for value in (True,5.5,-1,499,10001):
            with self.assertRaises(ValidationError): w.AmountIn(amount_cents=value,idempotency_key='request-123456789')
    @patch.dict(os.environ,{'VERCEL_ENV':'production','ASAAS_SANDBOX_ENABLED':'true','ASAAS_SANDBOX_API_KEY':'test'})
    def test_production_always_disabled(self):
        self.assertFalse(w.enabled())
        with self.assertRaises(HTTPException): w.provider('POST','/transfers',{})
    def test_retry_does_not_double_debit(self):
        self.seed()
        first,created=run(w.reserve_operation(self.db,'client',self.amount,'withdrawal'))
        again,repeated=run(w.reserve_operation(self.db,'client',self.amount,'withdrawal'))
        self.assertTrue(created);self.assertFalse(repeated);self.assertEqual(first['id'],again['id']);self.assertEqual(w.balance(self.mem.doc,'client'),4000)
    def test_idempotency_conflict(self):
        self.seed();run(w.reserve_operation(self.db,'client',self.amount,'withdrawal'))
        other=self.amount.model_copy(update={'amount_cents':1500})
        with self.assertRaises(HTTPException): run(w.reserve_operation(self.db,'client',other,'withdrawal'))
    def test_insufficient_funds_atomic(self):
        before=copy.deepcopy(self.mem.doc)
        with self.assertRaises(HTTPException): run(w.reserve_operation(self.db,'client',self.amount,'withdrawal'))
        self.assertEqual(before,self.mem.doc)
    def test_cas_retry_only_once(self):
        self.seed();self.mem.conflict=True
        run(w.reserve_operation(self.db,'client',self.amount,'withdrawal'))
        self.assertEqual(w.balance(self.mem.doc,'client'),4000)
    def test_two_people_release_once(self):
        self.fund()
        run(w.confirm_fund(self.db,'job','client'));self.assertEqual(w.balance(self.mem.doc,'pro'),0)
        run(w.confirm_fund(self.db,'job','client'));self.assertEqual(w.balance(self.mem.doc,'pro'),0)
        run(w.confirm_fund(self.db,'job','pro'));run(w.confirm_fund(self.db,'job','pro'))
        self.assertEqual(w.balance(self.mem.doc,'pro'),1000)
        self.assertEqual(w.balance(self.mem.doc,'client'),4000)
        self.assertTrue(all(e['amount_cents']+e['counter_amount_cents']==0 for e in self.mem.doc['ledger']))
    def test_outsider_cannot_confirm(self):
        self.fund()
        with self.assertRaises(HTTPException) as e: run(w.confirm_fund(self.db,'job','stranger'))
        self.assertEqual(e.exception.status_code,404)
    def test_dispute_blocks_release(self):
        self.fund();run(w.dispute_fund(self.db,'job','pro'))
        with self.assertRaises(HTTPException): run(w.confirm_fund(self.db,'job','client'))
        self.assertEqual(w.balance(self.mem.doc,'pro'),0)
    def test_checkout_required(self):
        self.fund();self.db.requests.find_one.return_value={'id':'job'}
        with self.assertRaises(HTTPException): run(w.confirm_fund(self.db,'job','pro'))
    def test_verified_receipt_net_credit_once(self):
        op,_=run(w.reserve_operation(self.db,'client',self.amount,'deposit'))
        run(w.patch_op(self.db,op['id'],{'provider_id':'pay_1','customer_id':'cus_1','status':'pending'}))
        record={'id':'pay_1','externalReference':op['id'],'value':10,'netValue':9,'customer':'cus_1','status':'RECEIVED'}
        with patch.object(w,'call',AsyncMock(return_value=record)):
            run(w.reconcile(self.db,op['id']));run(w.reconcile(self.db,op['id']))
        self.assertEqual(w.balance(self.mem.doc,'client'),900)
    def test_confirmed_not_received_does_not_credit(self):
        op,_=run(w.reserve_operation(self.db,'client',self.amount,'deposit'))
        run(w.patch_op(self.db,op['id'],{'provider_id':'pay_1','customer_id':'cus_1','status':'pending'}))
        record={'id':'pay_1','externalReference':op['id'],'value':10,'netValue':10,'customer':'cus_1','status':'CONFIRMED'}
        with patch.object(w,'call',AsyncMock(return_value=record)): run(w.reconcile(self.db,op['id']))
        self.assertEqual(w.balance(self.mem.doc,'client'),0)
    def test_mismatched_receipt_never_credits(self):
        op,_=run(w.reserve_operation(self.db,'client',self.amount,'deposit'))
        run(w.patch_op(self.db,op['id'],{'provider_id':'pay_1','customer_id':'cus_1','status':'pending'}))
        record={'id':'pay_1','externalReference':op['id'],'value':100,'netValue':100,'customer':'cus_1','status':'RECEIVED'}
        with patch.object(w,'call',AsyncMock(return_value=record)): run(w.reconcile(self.db,op['id']))
        self.assertEqual(w.balance(self.mem.doc,'client'),0)
        self.assertEqual(self.mem.doc['operations'][op['id']]['status'],'review')
    def test_failed_withdrawal_returns_hold_once(self):
        self.seed();op,_=run(w.reserve_operation(self.db,'client',self.amount,'withdrawal'))
        run(w.patch_op(self.db,op['id'],{'provider_id':'tr_1','status':'pending'}))
        record={'id':'tr_1','externalReference':op['id'],'value':10,'status':'FAILED'}
        with patch.object(w,'call',AsyncMock(return_value=record)):
            run(w.reconcile(self.db,op['id']));run(w.reconcile(self.db,op['id']))
        self.assertEqual(w.balance(self.mem.doc,'client'),5000)
    def test_snapshot_does_not_expose_other_users(self):
        self.seed();run(w.reserve_operation(self.db,'client',self.amount,'deposit'))
        result=run(w.snapshot(self.db,'other'))
        self.assertEqual(result['operations'],[]);self.assertEqual(result['ledger'],[]);self.assertEqual(result['available_cents'],0)
if __name__=='__main__': unittest.main()
