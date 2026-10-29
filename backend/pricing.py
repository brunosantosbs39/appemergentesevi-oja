from decimal import Decimal, ROUND_HALF_UP
from typing import Literal, Optional
from pydantic import BaseModel, Field, model_validator

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
