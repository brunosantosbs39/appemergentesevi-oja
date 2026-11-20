import unittest
from unittest.mock import AsyncMock
from types import SimpleNamespace
from datetime import date
from fastapi import HTTPException
from pydantic import ValidationError
from backend import companies as c

def run(co):
    try: co.send(None)
    except StopIteration as e: return e.value
    raise AssertionError("Unexpected IO")

class Tests(unittest.TestCase):
    def test_totals_do_not_count_cancelled_as_spend(self):
        result=c.totals([{"status":"planned","amount_cents":10000},{"status":"completed","amount_cents":20000},{"status":"paid","amount_cents":30000},{"status":"cancelled","amount_cents":90000}])
        self.assertEqual(result,{"planned_cents":10000,"completed_cents":20000,"paid_manual_cents":30000,"cancelled_cents":90000})
    def test_request_uses_total_budget_not_daily_multiplier(self):
        row=c.request_row({"id":"a","status":"aceito","budget":300.50,"daily_count":3,"created_at":"2026-10-29T12:00:00Z"})
        self.assertEqual(row["amount_cents"],30050)
        self.assertEqual(row["status"],"planned")
    def test_concluded_request_is_not_bank_payment(self):
        row=c.request_row({"id":"a","status":"concluido","budget":100,"created_at":"2026-10-29"})
        self.assertEqual(row["status"],"completed")
    def test_unpriced_request_flagged(self):
        self.assertTrue(c.request_row({"id":"a","status":"pendente","budget":None,"created_at":"2026-10-29"})["unpriced"])
    def test_unit_address_accepts_legacy_and_formats_full_destination(self):
        self.assertEqual(c.AddressIn(address="Rua antiga").location()["address"], "Rua antiga")
        unit=c.BranchIn(name="Centro",address_fields={"postal_code":"01001-000","street":"Praça da Sé","number":"12","complement":"Sala 2","district":"Sé","city":"São Paulo","state":"SP"})
        self.assertIn("Praça da Sé, 12, Sala 2, Sé, São Paulo/SP", unit.location()["address"])

    def test_negotiated_order_cost_is_assigned_once_to_its_branch(self):
        row=c.request_row({"id":"job","branch_id":"filial","created_at":"2026-11-10","status":"concluido","budget":120,"agreed_budget":150,"service_fund":{"status":"released"}})
        self.assertEqual(row["branch_id"],"filial")
        result=c.totals([row])
        self.assertEqual(result["paid_app_cents"],15000)
        self.assertEqual(result["completed_cents"],0)

    def test_edit_name_and_address_stays_scoped_to_selected_branch(self):
        companies=SimpleNamespace(find_one=AsyncMock(return_value={"_id":"company"}),update_one=AsyncMock())
        branches=SimpleNamespace(find_one=AsyncMock(return_value={"_id":"branch"}),update_one=AsyncMock())
        db=SimpleNamespace(companies=companies,company_branches=branches)
        endpoint=next(r.endpoint for r in c.build_router(db,lambda:None).routes if r.path=="/api/companies/{cid}/address")
        run(endpoint("company",c.UnitUpdate(name="  Centro  ",address="Rua Nova"),"branch",{"user_id":"owner"}))
        query, change=branches.update_one.call_args.args
        self.assertEqual(query,{"_id":"branch","owner_id":"owner"})
        self.assertEqual(change["$set"]["name"],"Centro")
        self.assertEqual(change["$set"]["address"],"Rua Nova")
        companies.update_one.assert_not_awaited()
        with self.assertRaises(HTTPException):
            run(endpoint("company",c.UnitUpdate(name="   ",address="Rua Nova"),"branch",{"user_id":"owner"}))

    def test_owner_required(self):
        db=SimpleNamespace(companies=SimpleNamespace(find_one=AsyncMock(return_value=None)))
        with self.assertRaises(HTTPException) as err:run(c.owned(db,"company","intruder"))
        self.assertEqual(err.exception.status_code,404)
        db.companies.find_one.assert_awaited_once_with({"_id":"company","owner_id":"intruder"})
    def test_branch_must_belong_to_company_and_owner(self):
        db=SimpleNamespace(companies=SimpleNamespace(find_one=AsyncMock(return_value={"_id":"company"})),company_branches=SimpleNamespace(find_one=AsyncMock(return_value=None)))
        with self.assertRaises(HTTPException):run(c.owned(db,"company","owner","other"))
        db.company_branches.find_one.assert_awaited_once_with({"_id":"other","company_id":"company","owner_id":"owner"})
    def body(self,**kw):
        return c.DailyIn(**dict({"worker":"Trabalhador","service_date":"2026-10-29","daily_cents":12550,"days":3,"idempotency_key":"manual-test-12345678"},**kw))
    def test_money_days_and_dates_validation(self):
        for fields in ({"daily_cents":True},{"daily_cents":1.2},{"daily_cents":-1},{"days":0},{"days":367},{"service_date":"2026-02-30"}):
            with self.assertRaises(ValidationError): self.body(**fields)
    def test_daily_amount_and_idempotency(self):
        records={}
        async def find(q):return records.get(q["_id"])
        async def insert(d):records[d["_id"]]=d
        db=SimpleNamespace(companies=SimpleNamespace(find_one=AsyncMock(return_value={"_id":"company"})),
            company_daily=SimpleNamespace(find_one=find,insert_one=insert))
        route=next(r for r in c.build_router(db,lambda:None).routes if r.path=="/api/companies/{cid}/daily" and "POST" in r.methods)
        one=run(route.endpoint("company",self.body(),{"user_id":"owner"}))
        again=run(route.endpoint("company",self.body(),{"user_id":"owner"}))
        self.assertEqual(one,again);self.assertEqual(len(records),1)
        self.assertEqual(next(iter(records.values()))["amount_cents"],37650)
        with self.assertRaises(HTTPException):run(route.endpoint("company",self.body(days=4),{"user_id":"owner"}))
    def test_dashboard_date_range_rejected(self):
        db=SimpleNamespace(companies=SimpleNamespace(find_one=AsyncMock(return_value={"_id":"company"})))
        route=next(r for r in c.build_router(db,lambda:None).routes if r.path.endswith("/dashboard"))
        with self.assertRaises(HTTPException):run(route.endpoint("company",date(2026,10,29),date(2026,10,28),None,{"user_id":"owner"}))
if __name__=="__main__":unittest.main()
