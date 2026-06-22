import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Enum as SAEnum, Text, ForeignKey, Numeric, JSON
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class EncounterType(str, enum.Enum):
    opd = "opd"
    ipd = "ipd"
    emergency = "emergency"


class EncounterStatus(str, enum.Enum):
    open = "open"
    closed = "closed"
    referred = "referred"


class TriageCategory(str, enum.Enum):
    immediate = "immediate"
    urgent = "urgent"
    non_urgent = "non_urgent"


class Encounter(Base):
    __tablename__ = "encounters"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    encounter_type: Mapped[EncounterType] = mapped_column(SAEnum(EncounterType), nullable=False)
    encounter_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    attending_doctor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    chief_complaint: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[EncounterStatus] = mapped_column(SAEnum(EncounterStatus), default=EncounterStatus.open, nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


class TriageAssessment(Base):
    __tablename__ = "triage_assessments"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    encounter_id: Mapped[str] = mapped_column(ForeignKey("encounters.id"), nullable=False, unique=True)
    nurse_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    bp_systolic: Mapped[int | None] = mapped_column(nullable=True)
    bp_diastolic: Mapped[int | None] = mapped_column(nullable=True)
    pulse: Mapped[int | None] = mapped_column(nullable=True)
    temperature: Mapped[float | None] = mapped_column(Numeric(4, 1), nullable=True)
    spo2: Mapped[int | None] = mapped_column(nullable=True)
    weight: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    height: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    respiratory_rate: Mapped[int | None] = mapped_column(nullable=True)
    pain_score: Mapped[int | None] = mapped_column(nullable=True)
    triage_category: Mapped[TriageCategory] = mapped_column(SAEnum(TriageCategory), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class ClinicalNote(Base):
    __tablename__ = "clinical_notes"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    encounter_id: Mapped[str] = mapped_column(ForeignKey("encounters.id"), nullable=False, index=True)
    author_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    subjective: Mapped[str | None] = mapped_column(Text, nullable=True)
    objective: Mapped[str | None] = mapped_column(Text, nullable=True)
    assessment: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    diagnoses: Mapped[list | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
