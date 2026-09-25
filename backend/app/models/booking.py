from datetime import datetime, time
from enum import StrEnum

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Time, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.session import utcnow


class BookingStatus(StrEnum):
    BOOKED = "BOOKED"
    WAITING = "WAITING"
    CURRENT = "CURRENT"
    PASSED = "PASSED"
    CANCELLED = "CANCELLED"
    LATE = "LATE"


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        UniqueConstraint("session_id", "slot_index", name="uq_booking_active_slot"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("defense_sessions.id", ondelete="CASCADE"), index=True
    )
    booking_token: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    student_name: Mapped[str] = mapped_column(String(120))
    group_name: Mapped[str] = mapped_column(String(40))
    lab_name: Mapped[str] = mapped_column(String(120))
    position: Mapped[int] = mapped_column(Integer)
    slot_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scheduled_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    original_scheduled_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.BOOKED)
    notes: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    session = relationship("DefenseSession", back_populates="bookings")

