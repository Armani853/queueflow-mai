from datetime import date, timedelta, time

from sqlalchemy import select

from app.database import SessionLocal
from app.models import Booking, BookingStatus, DefenseSession
from app.services.queue_engine import QueueEngine
from app.services.tokens import new_token


def seed() -> None:
    db = SessionLocal()
    try:
        existing = db.scalar(select(DefenseSession).where(DefenseSession.title == "Демо: сдача лабораторных"))
        if existing:
            print(f"Teacher: http://localhost:5173/manage/{existing.admin_token}")
            print(f"Student: http://localhost:5173/q/{existing.public_token}")
            return
        session = DefenseSession(
            public_token=new_token(),
            admin_token=new_token(),
            title="Демо: сдача лабораторных",
            subject="Численные методы",
            session_date=date.today() + timedelta(days=1),
            start_time=time(12, 0),
            end_time=time(14, 0),
            room="ГУК Б-315",
            slot_duration_minutes=10,
            buffer_minutes=2,
            max_students=10,
        )
        db.add(session)
        db.flush()
        students = [
            ("Арман Саркисян", "М8О-301Б-23", "ЛР 1.3"),
            ("Мария Волкова", "М8О-301Б-23", "ЛР 1.4"),
            ("Давид Арутюнян", "М8О-301Б-23", "ЛР 1.2"),
            ("Анна Соколова", "М8О-301Б-23", "ЛР 1.5"),
        ]
        for index, (name, group, lab) in enumerate(students):
            scheduled = QueueEngine.slot_time(session, index)
            db.add(
                Booking(
                    session_id=session.id,
                    booking_token=new_token(),
                    student_name=name,
                    group_name=group,
                    lab_name=lab,
                    position=index + 1,
                    slot_index=index,
                    scheduled_time=scheduled,
                    original_scheduled_time=scheduled,
                    status=BookingStatus.WAITING,
                )
            )
        db.commit()
        print(f"Teacher: http://localhost:5173/manage/{session.admin_token}")
        print(f"Student: http://localhost:5173/q/{session.public_token}")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
