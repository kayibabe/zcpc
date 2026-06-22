from pydantic import BaseModel
from datetime import datetime
from app.models.nursing import MARStatus


class VitalSignsCreate(BaseModel):
    admission_id: str
    patient_id: str
    bp_systolic: int | None = None
    bp_diastolic: int | None = None
    pulse: int | None = None
    temperature: float | None = None
    spo2: int | None = None
    respiratory_rate: int | None = None
    urine_output_ml: int | None = None
    fluid_intake_ml: int | None = None
    gcs: int | None = None
    notes: str | None = None


class NursingNoteCreate(BaseModel):
    admission_id: str
    patient_id: str
    shift: str
    note_text: str


class MARCreate(BaseModel):
    prescription_item_id: str
    patient_id: str
    scheduled_time: datetime
    administered_at: datetime | None = None
    dose_given: str | None = None
    route: str | None = None
    status: MARStatus
    notes: str | None = None


class VitalSignsResponse(BaseModel):
    id: str
    admission_id: str
    patient_id: str
    nurse_id: str
    bp_systolic: int | None
    bp_diastolic: int | None
    pulse: int | None
    temperature: float | None
    spo2: int | None
    respiratory_rate: int | None
    urine_output_ml: int | None
    fluid_intake_ml: int | None
    gcs: int | None
    charted_at: datetime
    notes: str | None

    model_config = {"from_attributes": True}


class NursingNoteResponse(BaseModel):
    id: str
    admission_id: str
    patient_id: str
    nurse_id: str
    shift: str
    note_text: str
    created_at: datetime

    model_config = {"from_attributes": True}


class MARResponse(BaseModel):
    id: str
    prescription_item_id: str
    patient_id: str
    administered_by_id: str
    scheduled_time: datetime
    administered_at: datetime | None
    dose_given: str | None
    route: str | None
    status: MARStatus
    notes: str | None

    model_config = {"from_attributes": True}
