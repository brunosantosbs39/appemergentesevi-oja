from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator

def cents(amount):
    return int((Decimal(str(amount)) * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))

def worker_offer(gross):
    return (gross * 90 + 50) // 100

def client_quote(net):
    return (net * 110 + 50) // 100

def present_request(r, uid):
    priced = r.pop("pricing_version", None)
    worker = uid != r.get("client_id")
    net = r.pop("agreed_net_cents", None)
    if priced and worker:
        if r.get("budget") is not None:
            r["budget"] = worker_offer(cents(r["budget"])) / 100
        if r.get("unit_cents") is not None:
            r["unit_cents"] = worker_offer(r["unit_cents"])
        if net is not None:
            r["agreed_budget"] = net / 100
    for a in r.get("applications", []):
        agreed = a.pop("quote_net_cents", None)
        if worker and agreed is not None:
            a["negotiated_budget"] = agreed / 100
    return r

def present_message(msg, uid):
    proposal = msg.get("proposal", {})
    gross = proposal.pop("client_cents", None)
    if gross is not None and msg["sender_id"] != uid:
        proposal["amount"] = gross / 100
    return msg

class Pricing(BaseModel):
    billing_type: Literal["daily", "hourly", "fixed"] = "fixed"
    quantity: Decimal = Field(default=Decimal("1"), gt=0, le=10000, decimal_places=2)
    unit_cents: Optional[int] = Field(default=None, strict=True, ge=0, le=100000000)

    @model_validator(mode="after")
    def validate_units(self):
        if self.billing_type == "fixed" and self.quantity != 1:
            raise ValueError("Orçamento fechado deve ter quantidade 1")
        if self.billing_type == "daily" and self.quantity != self.quantity.to_integral_value():
            raise ValueError("Informe uma quantidade inteira de diárias")
        if self.unit_cents is not None and self.total_cents() > 100000000:
            raise ValueError("O total deve ser de até R$ 1.000.000")
        return self

    def total_cents(self):
        if self.unit_cents is None:
            return None
        return int((self.quantity * self.unit_cents).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
