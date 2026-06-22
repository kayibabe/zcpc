from pydantic import BaseModel
from datetime import datetime
from app.models.admission import WardType, BedStatus, AdmissionStatus, DischargeType


class WardCreate(BaseModel):
    name: str
    ward_type: WardType
    total_beds: int = 0
    floor: str | None = None
    charge_per_day: float | None = None
    notes: str | None = None


class BedCreate(BaseModel):
    bed_number: str
    bed_type: str = "general"


class AdmissionCreate(BaseModel):
    patient_id: str
    encounter_id: str
    ward_id: str
    bed_id: str
    diagnosis: str | None = None
    notes: str | None = None


class DischargeCreate(BaseModel):
    discharge_type: DischargeType
    discharge_summary: str | None = None
    follow_up_date: str | None = None


class BedResponse(BaseModel):
    id: str
    ward_id: str
    bed_number: str
    bed_type: str
    status: BedStatus
    current_admission_id: str | None

    model_config = {"from_attributes": True}


class WardResponse(BaseModel):
    id: str
    name: str
    ward_type: WardType
    total_beds: int
    floor: str | None
    charge_per_day: float | None
    notes: str | None
    is_active: bool
    beds: list[BedResponse] = []

    model_config = {"from_attributes": True}


class AdmissionListResponse(BaseModel):
    id: str
    patient_id: str
    encounter_id: str
    ward_id: str
    bed_id: str
    admitting_doctor_id: str
    admission_date: datetime
    discharge_date: datetime | None
    status: AdmissionStatus

    model_config = {"from_attributes": True}


class AdmissionResponse(AdmissionListResponse):
    discharge_type: DischargeType | None
    discharge_summary: str | None
    created_at: datetime
    updated_at: datetime
