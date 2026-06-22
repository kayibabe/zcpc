from pydantic import BaseModel
from datetime import datetime
from app.models.encounter import EncounterType, EncounterStatus, TriageCategory


class EncounterCreate(BaseModel):
    patient_id: str
    encounter_type: EncounterType = EncounterType.opd
    attending_doctor_id: str | None = None
    chief_complaint: str | None = None
    department: str | None = None


class EncounterUpdate(BaseModel):
    attending_doctor_id: str | None = None
    status: EncounterStatus | None = None
    chief_complaint: str | None = None
    department: str | None = None


class TriageCreate(BaseModel):
    triage_category: TriageCategory
    bp_systolic: int | None = None
    bp_diastolic: int | None = None
    pulse: int | None = None
    temperature: float | None = None
    spo2: int | None = None
    weight: float | None = None
    height: float | None = None
    respiratory_rate: int | None = None
    pain_score: int | None = None
    notes: str | None = None


class ClinicalNoteCreate(BaseModel):
    subjective: str | None = None
    objective: str | None = None
    assessment: str | None = None
    plan: str | None = None
    diagnoses: list | None = None


class TriageResponse(BaseModel):
    id: str
    encounter_id: str
    nurse_id: str
    triage_category: TriageCategory
    bp_systolic: int | None
    bp_diastolic: int | None
    pulse: int | None
    temperature: float | None
    spo2: int | None
    weight: float | None
    height: float | None
    respiratory_rate: int | None
    pain_score: int | None
    notes: str | None
    assessed_at: datetime

    model_config = {"from_attributes": True}


class ClinicalNoteResponse(BaseModel):
    id: str
    encounter_id: str
    author_id: str
    subjective: str | None
    objective: str | None
    assessment: str | None
    plan: str | None
    diagnoses: list | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EncounterListResponse(BaseModel):
    id: str
    patient_id: str
    encounter_type: EncounterType
    encounter_date: datetime
    status: EncounterStatus
    chief_complaint: str | None
    attending_doctor_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class EncounterResponse(BaseModel):
    id: str
    patient_id: str
    encounter_type: EncounterType
    encounter_date: datetime
    attending_doctor_id: str | None
    chief_complaint: str | None
    status: EncounterStatus
    created_by: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EncounterDetailResponse(EncounterResponse):
    triage: TriageResponse | None = None
    notes: list[ClinicalNoteResponse] = []
