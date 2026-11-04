import unittest
from pydantic import ValidationError
from backend.pricing import Pricing
class PricingTests(unittest.TestCase):
    def test_daily(self): self.assertEqual(Pricing(billing_type="daily",unit_cents=15000,quantity=3).total_cents(),45000)
    def test_hourly(self): self.assertEqual(Pricing(billing_type="hourly",unit_cents=3000,quantity="2.5").total_cents(),7500)
    def test_fixed(self): self.assertEqual(Pricing(unit_cents=12345).total_cents(),12345)
    def test_rounding(self): self.assertEqual(Pricing(billing_type="hourly",unit_cents=101,quantity="0.5").total_cents(),51)
    def test_legacy(self): self.assertIsNone(Pricing().total_cents())
    def test_invalid(self):
        for args in [{"billing_type":"daily","quantity":"1.5"},{"quantity":2},{"quantity":0},{"billing_type":"hourly","quantity":"1.001"},{"unit_cents":100000000,"billing_type":"hourly","quantity":2}]:
            with self.assertRaises(ValidationError): Pricing(**args)
