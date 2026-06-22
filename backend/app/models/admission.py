import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Enum as SAEnum, Text, ForeignKey, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class WardType(str, enum.Enum):
    general = "general"
    maternity = "maternity"
    private = "private"
    icu = "icu"
    pediatric = "pediatric"


class BedStatus(str, enum.Enum):
    available = "available"
    occupied = "occupied"
    maintenance = "maintenance"


class AdmissionStatus(str, enum.Enum):
    admitted = "admitted"
    discharged = "discharged"
    transferred = "transferred"


class DischargeType(str, enum.Enum):
    normal = "normal"
    ama = "ama"
    death = "death"
    transfer = "transfer"
    absconded = "absconded"


class Ward(Base):
    __tablename__ = "wards"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    ward_type: Mapped[WardType] = mapped_column(SAEnum(WardType), nullable=False)
    total_beds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    floor: Mapped[str | None] = mapped_column(String(20), nullable=True)
    charge_per_day: Mapped[float | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Bed(Base):
    __tablename__ = "beds"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id"), nullable=False, index=True)
    bed_number: Mapped[str] = mapped_column(String(20), nullable=False)
    bed_type: Mapped[str] = mapped_column(String(50), default="general", nullable=False)
    status: Mapped[BedStatus] = mapped_column(SAEnum(BedStatus), default=BedStatus.available, nullable=False)
    current_admission_id: Mapped[str | None] = mapped_column(ForeignKey("admissions.id"), nullable=True)


class Admission(Base):
    __tablename__ = "admissions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    encounter_id: Mapped[str] = mapped_column(ForeignKey("encounters.id"), nullable=False)
    ward_id: Mapped[str] = mapped_column(ForeignKey("wards.id"), nullable=False)
    bed_id: Mapped[str] = mapped_column(ForeignKey("beds.id"), nullable=False)
    admitting_doctor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    admission_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    discharge_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    discharge_type: Mapped[DischargeType | None] = mapped_column(SAEnum(DischargeType), nullable=True)
    discharge_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[AdmissionStatus] = mapped_column(SAEnum(AdmissionStatus), default=AdmissionStatus.admitted, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
