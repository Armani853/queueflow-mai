from app.models import Booking, BookingStatus, DefenseSession
from app.schemas.booking import BookingPublic, SlotPublic
from app.schemas.session import SessionManage, SessionPublic
from app.services.queue_engine import QueueEngine


def build_slots(session: DefenseSession, bookings: list[Booking]) -> list[SlotPublic]:
    by_index = {booking.slot_index: booking for booking in bookings if booking.slot_index is not None}
    return [
        SlotPublic(
            index=index,
            time=QueueEngine.slot_time(session, index),
            available=index not in by_index and session.is_active,
            booking=BookingPublic.model_validate(by_index[index]) if index in by_index else None,
        )
        for index in range(QueueEngine.capacity(session))
    ]


def public_payload(session: DefenseSession, bookings: list[Booking] | None = None) -> SessionPublic:
    bookings = bookings if bookings is not None else [
        booking for booking in session.bookings if booking.status != BookingStatus.CANCELLED
    ]
    bookings = sorted(
        bookings,
        key=lambda item: (
            item.slot_index is None,
            item.slot_index if item.slot_index is not None else session.max_students,
            item.created_at,
        ),
    )
    current, next_booking = QueueEngine.current_and_next(bookings)
    scalar_fields = {
        field: getattr(session, field)
        for field in SessionPublic.model_fields
        if field not in {"slots", "bookings", "current", "next_booking"} and hasattr(session, field)
    }
    return SessionPublic(
        **scalar_fields,
        slots=build_slots(session, bookings),
        bookings=[BookingPublic.model_validate(item) for item in bookings],
        current=BookingPublic.model_validate(current) if current else None,
        next_booking=BookingPublic.model_validate(next_booking) if next_booking else None,
    )


def manage_payload(session: DefenseSession, bookings: list[Booking] | None = None) -> SessionManage:
    public = public_payload(session, bookings)
    return SessionManage(**public.model_dump(), admin_token=session.admin_token)
