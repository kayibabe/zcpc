from pydantic import BaseModel
from datetime import date, datetime
from app.models.patient import Gender, BloodGroup


class PatientCreate(BaseModel):
    first_name: str
    last_name: str
    other_names: str | None = None
    date_of_birth: date | None = None
    gender: Gender
    blood_group: BloodGroup = BloodGroup.UNKNOWN
    phone: str | None = None
    phone_alt: str | None = None
    email: str | None = None
    address: str | None = None
    village: str | None = None
    district: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_relation: str | None = None
    insurance_provider: str | None = None
    insurance_number: str | None = None
    known_allergies: str | None = None
    chronic_conditions: str | None = None


class PatientUpdate(PatientCreate):
    first_name: str | None = None
    last_name: str | None = None
    gender: Gender | None = None


class PatientResponse(BaseModel):
    id: str
    mrn: str
    first_name: str
    last_name: str
    other_names: str | None
    date_of_birth: date | None
    gender: Gender
    blood_group: BloodGroup
    phone: str | None
    phone_alt: str | None
    email: str | None
    address: str | None
    village: str | None
    district: str | None
    emergency_contact_name: str | None
    emergency_contact_phone: str | None
    emergency_contact_relation: str | None
    insurance_provider: str | None
    insurance_number: str | None
    known_allergies: str | None
    chronic_conditions: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PatientListResponse(BaseModel):
    id: str
    mrn: str
    first_name: str
    last_name: str
    gender: Gender
    date_of_birth: date | None
    phone: str | None
    insurance_provider: str | None

    model_config = {"from_attributes": True}
