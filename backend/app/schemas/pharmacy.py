from pydantic import BaseModel
from datetime import datetime, date
from app.models.pharmacy import DrugForm, PrescriptionStatus


class DrugCreate(BaseModel):
    name: str
    generic_name: str | None = None
    category: str | None = None
    form: DrugForm
    strength: str | None = None
    unit_of_measure: str = "units"
    unit_price: float = 0.0
    reorder_level: int = 10
    is_controlled: bool = False
    contraindications: str | None = None


class DrugStockCreate(BaseModel):
    batch_number: str
    expiry_date: date
    quantity_received: int
    purchase_price: float | None = None
    supplier: str | None = None
    received_date: date


class PrescriptionItemCreate(BaseModel):
    drug_id: str
    dose: str
    frequency: str
    route: str = "oral"
    duration_days: int | None = None
    quantity: int
    instructions: str | None = None
    start_date: date | None = None


class PrescriptionCreate(BaseModel):
    encounter_id: str
    patient_id: str
    notes: str | None = None
    items: list[PrescriptionItemCreate]


class DispenseItemCreate(BaseModel):
    prescription_item_id: str
    quantity_dispensed: int


class DispenseCreate(BaseModel):
    items: list[DispenseItemCreate]


class DrugResponse(BaseModel):
    id: str
    name: str
    generic_name: str | None
    category: str | None
    form: DrugForm
    strength: str | None
    unit_of_measure: str
    unit_price: float
    reorder_level: int
    is_controlled: bool
    is_active: bool

    model_config = {"from_attributes": True}


class DrugStockResponse(BaseModel):
    id: str
    drug_id: str
    batch_number: str
    expiry_date: date
    quantity_received: int
    quantity_current: int
    purchase_price: float | None
    supplier: str | None
    received_date: date

    model_config = {"from_attributes": True}


class PrescriptionItemResponse(BaseModel):
    id: str
    prescription_id: str
    drug_id: str
    dose: str
    frequency: str
    route: str
    duration_days: int | None
    quantity: int
    dispensed_quantity: int
    instructions: str | None
    start_date: date | None
    end_date: date | None
    is_dispensed: bool
    dispensed_at: datetime | None

    model_config = {"from_attributes": True}


class PrescriptionListResponse(BaseModel):
    id: str
    encounter_id: str
    patient_id: str
    prescribed_by_id: str
    prescribed_at: datetime
    status: PrescriptionStatus
    notes: str | None

    model_config = {"from_attributes": True}


class PrescriptionResponse(PrescriptionListResponse):
    items: list[PrescriptionItemResponse] = []
