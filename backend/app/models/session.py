from datetime import date, datetime, time, timezone
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, Enum, Integer, String, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class QueueMode(StrEnum):
    COMPACT = "COMPACT"
    KEEP_TIME = "KEEP_TIME"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class DefenseSession(Base):
    __tablename__ = "defense_sessions"
    __table_args__ = (
        CheckConstraint("slot_duration_minutes > 0", name="ck_session_slot_positive"),
        CheckConstraint("buffer_minutes >= 0", name="ck_session_buffer_nonnegative"),
        CheckConstraint("max_students > 0", name="ck_session_max_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    public_token: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    admin_token: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(120))
    subject: Mapped[str] = mapped_column(String(120))
    session_date: Mapped[date] = mapped_column(Date)
    start_time: Mapped[time] = mapped_column(Time)
    end_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    room: Mapped[str] = mapped_column(String(80))
    slot_duration_minutes: Mapped[int] = mapped_column(Integer)
    buffer_minutes: Mapped[int] = mapped_column(Integer, default=0)
    max_students: Mapped[int] = mapped_column(Integer)
    queue_mode: Mapped[QueueMode] = mapped_column(Enum(QueueMode), default=QueueMode.COMPACT)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    bookings = relationship(
        "Booking", back_populates="session", cascade="all, delete-orphan", passive_deletes=True
    )

