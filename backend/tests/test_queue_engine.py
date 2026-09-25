from datetime import date, time, timedelta

from app.models import Booking, BookingStatus, DefenseSession
from app.services.queue_engine import QueueEngine


def make_session(db_session, buffer=2):
    session = DefenseSession(
        public_token="public",
        admin_token="admin",
        title="Тест",
        subject="Предмет",
        session_date=date.today() + timedelta(days=1),
        start_time=time(12, 0),
        end_time=time(13, 0),
        room="101",
        slot_duration_minutes=10,
        buffer_minutes=buffer,
        max_students=10,
    )
    db_session.add(session)
    db_session.flush()
    return session


def add_booking(db, session, index, name):
    booking = Booking(
        session_id=session.id,
        booking_token=f"token-{name}",
        student_name=name,
        group_name="М8О",
        lab_name="ЛР",
        position=index + 1,
        slot_index=index,
        scheduled_time=QueueEngine.slot_time(session, index),
        original_scheduled_time=QueueEngine.slot_time(session, index),
        status=BookingStatus.WAITING,
    )
    db.add(booking)
    db.flush()
    return booking


def test_buffer_math(db_session):
    session = make_session(db_session)
    assert QueueEngine.slot_time(session, 0) == time(12, 0)
    assert QueueEngine.slot_time(session, 3) == time(12, 36)


def test_capacity_respects_end_time(db_session):
    session = make_session(db_session, buffer=0)
    session.end_time = time(12, 35)
    assert QueueEngine.capacity(session) == 3


def test_central_recalculation(db_session):
    session = make_session(db_session)
    first = add_booking(db_session, session, 0, "A")
    third = add_booking(db_session, session, 2, "C")
    QueueEngine.recalculate(db_session, session)
    assert first.position == 1
    assert third.position == 2
    assert third.scheduled_time == time(12, 24)


def test_compact_after_removal(db_session):
    session = make_session(db_session)
    add_booking(db_session, session, 0, "A")
    second = add_booking(db_session, session, 1, "B")
    third = add_booking(db_session, session, 2, "C")
    QueueEngine.remove_from_schedule(db_session, session, second, BookingStatus.CANCELLED)
    assert third.slot_index == 1
    assert third.scheduled_time == time(12, 12)

