from datetime import date, datetime, time, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Booking, BookingStatus, DefenseSession, QueueMode
from app.config import settings


ACTIVE_STATUSES = {
    BookingStatus.BOOKED,
    BookingStatus.WAITING,
    BookingStatus.CURRENT,
    BookingStatus.PASSED,
}


class QueueEngine:
    """The single source of truth for positions and scheduled times."""

    @staticmethod
    def slot_time(session: DefenseSession, slot_index: int) -> time:
        base = datetime.combine(date.today(), session.start_time)
        step = session.slot_duration_minutes + session.buffer_minutes
        return (base + timedelta(minutes=slot_index * step)).time().replace(second=0, microsecond=0)

    @staticmethod
    def latest_actual_finish(session: DefenseSession) -> datetime | None:
        finished = [booking.actual_finished_at for booking in session.bookings if booking.actual_finished_at]
        if not finished:
            return None
        normalized = [
            value if value.tzinfo else value.replace(tzinfo=settings.timezone_info)
            for value in finished
        ]
        return max(normalized).astimezone(settings.timezone_info)

    @classmethod
    def effective_slot_time(cls, session: DefenseSession, slot_index: int) -> time:
        anchor = cls.latest_actual_finish(session)
        if not anchor:
            return cls.slot_time(session, slot_index)
        step = session.slot_duration_minutes + session.buffer_minutes
        scheduled = anchor + timedelta(
            minutes=session.buffer_minutes + slot_index * step
        )
        return scheduled.timetz().replace(tzinfo=None, microsecond=0)

    @staticmethod
    def capacity(session: DefenseSession) -> int:
        capacity = session.max_students
        if session.end_time:
            start = datetime.combine(date.today(), session.start_time)
            end = datetime.combine(date.today(), session.end_time)
            minutes = int((end - start).total_seconds() // 60)
            step = session.slot_duration_minutes + session.buffer_minutes
            capacity = min(capacity, max(0, (minutes + session.buffer_minutes) // step))
        return capacity

    @staticmethod
    def active_bookings(db: Session, session_id: int) -> list[Booking]:
        statement = (
            select(Booking)
            .where(Booking.session_id == session_id, Booking.slot_index.is_not(None))
            .order_by(Booking.slot_index, Booking.created_at)
        )
        return list(db.scalars(statement))

    @classmethod
    def recalculate(cls, db: Session, session: DefenseSession) -> list[Booking]:
        bookings = cls.active_bookings(db, session.id)
        if cls.latest_actual_finish(session):
            bookings = [
                booking
                for booking in bookings
                if booking.status in {
                    BookingStatus.BOOKED,
                    BookingStatus.WAITING,
                    BookingStatus.CURRENT,
                }
            ]
        for position, booking in enumerate(bookings, start=1):
            booking.position = position
            booking.scheduled_time = cls.effective_slot_time(session, booking.slot_index or 0)
        db.flush()
        return bookings

    @classmethod
    def compact_after_removal(
        cls, db: Session, session: DefenseSession, removed_slot_index: int
    ) -> list[Booking]:
        if session.queue_mode == QueueMode.COMPACT:
            later = list(
                db.scalars(
                    select(Booking)
                    .where(
                        Booking.session_id == session.id,
                        Booking.slot_index.is_not(None),
                        Booking.slot_index > removed_slot_index,
                    )
                    .order_by(Booking.slot_index)
                )
            )
            for booking in later:
                booking.slot_index = (booking.slot_index or 0) - 1
                db.flush()
        return cls.recalculate(db, session)

    @classmethod
    def remove_from_schedule(
        cls, db: Session, session: DefenseSession, booking: Booking, status: BookingStatus
    ) -> None:
        removed_index = booking.slot_index
        booking.status = status
        booking.slot_index = None
        booking.scheduled_time = None
        db.flush()
        if removed_index is not None:
            cls.compact_after_removal(db, session, removed_index)

    @classmethod
    def move_to_nearest_slot(cls, db: Session, session: DefenseSession, booking: Booking) -> None:
        occupied = {item.slot_index for item in cls.active_bookings(db, session.id)}
        target = next((index for index in range(cls.capacity(session)) if index not in occupied), None)
        if target is None:
            raise ValueError("В очереди нет свободного слота")
        booking.slot_index = target
        booking.status = BookingStatus.WAITING
        booking.scheduled_time = cls.slot_time(session, target)
        cls.recalculate(db, session)

    @classmethod
    def complete_booking(
        cls,
        db: Session,
        session: DefenseSession,
        booking: Booking,
        finished_at: datetime,
    ) -> list[Booking]:
        """Complete the current booking and rebase the remaining queue on server time."""
        removed_index = booking.slot_index
        booking.status = BookingStatus.PASSED
        booking.actual_finished_at = finished_at
        booking.slot_index = None
        db.flush()
        if removed_index is not None:
            remaining = cls.compact_after_removal(db, session, removed_index)
        else:
            remaining = cls.recalculate(db, session)
        if remaining:
            remaining[0].status = BookingStatus.CURRENT
            for waiting in remaining[1:]:
                waiting.status = BookingStatus.WAITING
        db.flush()
        return remaining

    @classmethod
    def current_and_next(
        cls, bookings: list[Booking]
    ) -> tuple[Booking | None, Booking | None]:
        current = next((item for item in bookings if item.status == BookingStatus.CURRENT), None)
        candidates = [
            item
            for item in bookings
            if item.status in {BookingStatus.BOOKED, BookingStatus.WAITING}
        ]
        next_booking = candidates[0] if candidates else None
        return current, next_booking

