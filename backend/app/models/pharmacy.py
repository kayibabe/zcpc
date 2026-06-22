import uuid
import enum
from datetime import datetime, date, timezone
from sqlalchemy import String, DateTime, Date, Enum as SAEnum, Text, ForeignKey, Numeric, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class DrugForm(str, enum.Enum):
    tablet = "tablet"
    capsule = "capsule"
    syrup = "syrup"
    injection = "injection"
    cream = "cream"
    drops = "drops"
    inhaler = "inhaler"
    suppository = "suppository"
    patch = "patch"
    other = "other"


class PrescriptionStatus(str, enum.Enum):
    draft = "draft"
    active = "active"
    dispensed = "dispensed"
    partially_dispensed = "partially_dispensed"
    cancelled = "cancelled"


class Drug(Base):
    __tablename__ = "drugs"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    generic_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    form: Mapped[DrugForm] = mapped_column(SAEnum(DrugForm), nullable=False)
    strength: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit_of_measure: Mapped[str] = mapped_column(String(50), nullable=False, default="units")
    unit_price: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    reorder_level: Mapped[int] = mapped_column(Integer, nullable=False, default=10)
    is_controlled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    contraindications: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class DrugStock(Base):
    __tablename__ = "drug_stock"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    drug_id: Mapped[str] = mapped_column(ForeignKey("drugs.id"), nullable=False, index=True)
    batch_number: Mapped[str] = mapped_column(String(100), nullable=False)
    expiry_date: Mapped[date] = mapped_column(Date, nullable=False)
    quantity_received: Mapped[int] = mapped_column(Integer, nullable=False)
    quantity_current: Mapped[int] = mapped_column(Integer, nullable=False)
    purchase_price: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    supplier: Mapped[str | None] = mapped_column(String(200), nullable=True)
    received_date: Mapped[date] = mapped_column(Date, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )


class Prescription(Base):
    __tablename__ = "prescriptions"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    encounter_id: Mapped[str] = mapped_column(ForeignKey("encounters.id"), nullable=False, index=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), nullable=False, index=True)
    prescribed_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    prescribed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False
    )
    status: Mapped[PrescriptionStatus] = mapped_column(
        SAEnum(PrescriptionStatus), default=PrescriptionStatus.active, nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class PrescriptionItem(Base):
    __tablename__ = "prescription_items"

    id: Mapped[str] = mapped_column(UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4()))
    prescription_id: Mapped[str] = mapped_column(ForeignKey("prescriptions.id"), nullable=False, index=True)
    drug_id: Mapped[str] = mapped_column(ForeignKey("drugs.id"), nullable=False)
    dose: Mapped[str] = mapped_column(String(100), nullable=False)
    frequency: Mapped[str] = mapped_column(String(100), nullable=False)
    route: Mapped[str] = mapped_column(String(50), nullable=False, default="oral")
    duration_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    dispensed_quantity: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    dispensed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    dispensed_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    is_dispensed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
