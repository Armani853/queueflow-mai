from datetime import datetime
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import settings
from app.models import Booking, BookingStatus, DefenseSession
from app.routers.helpers import get_public_session
from app.routers.serializers import public_payload
from app.schemas.booking import BookingConfirmation, BookingCreate
from app.schemas.session import SessionCreate, SessionCreated, SessionPublic
from app.services.queue_engine import QueueEngine
from app.services.tokens import new_token


router = APIRouter(prefix="/api/sessions", tags=["sessions"])
logger = logging.getLogger("queueflow.sessions")


@router.post("", response_model=SessionCreated, status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> SessionCreated:
    session = DefenseSession(**payload.model_dump(), public_token=new_token(), admin_token=new_token())
    if QueueEngine.capacity(session) < 1:
        raise HTTPException(status_code=422, detail="В заданном интервале нет ни одного полного слота")
    db.add(session)
    db.commit()
    db.refresh(session)
    logger.info("Session created id=%s date=%s", session.id, session.session_date)
    public = public_payload(session, [])
    return SessionCreated(
        **public.model_dump(),
        admin_token=session.admin_token,
        public_path=f"/q/{session.public_token}",
        manage_path=f"/manage/{session.admin_token}",
    )


@router.get("/{public_token}", response_model=SessionPublic)
def read_session(public_token: str, db: Session = Depends(get_db)) -> SessionPublic:
    session = get_public_session(db, public_token)
    QueueEngine.recalculate(db, session)
    return public_payload(session)


@router.get("/{public_token}/queue", response_model=SessionPublic)
def read_queue(public_token: str, db: Session = Depends(get_db)) -> SessionPublic:
    return read_session(public_token, db)


@router.post(
    "/{public_token}/bookings",
    response_model=BookingConfirmation,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(
    public_token: str, payload: BookingCreate, db: Session = Depends(get_db)
) -> BookingConfirmation:
    try:
        if db.bind and db.bind.dialect.name == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        session = db.scalar(select(DefenseSession).where(DefenseSession.public_token == public_token))
        if not session:
            raise HTTPException(status_code=404, detail="Очередь не найдена или больше недоступна.")
        if not session.is_active:
            raise HTTPException(status_code=409, detail="Запись в эту очередь закрыта")
        now = datetime.now(settings.timezone_info)
        session_end = session.end_time or QueueEngine.slot_time(session, QueueEngine.capacity(session) - 1)
        if session.session_date < now.date() or (
            session.session_date == now.date() and now.time().replace(tzinfo=None) > session_end
        ):
            raise HTTPException(status_code=409, detail="Окно записи уже завершено")
        if payload.slot_index >= QueueEngine.capacity(session):
            raise HTTPException(status_code=422, detail="Такого слота нет")
        duplicate = db.scalar(
            select(Booking).where(
                Booking.session_id == session.id,
                Booking.student_name == payload.student_name,
                Booking.group_name == payload.group_name,
                Booking.status != BookingStatus.CANCELLED,
            )
        )
        if duplicate:
            raise HTTPException(status_code=409, detail="У студента уже есть активная запись")
        occupied = db.scalar(
            select(Booking).where(
                Booking.session_id == session.id, Booking.slot_index == payload.slot_index
            )
        )
        if occupied:
            raise HTTPException(status_code=409, detail="Этот слот уже заняли. Выберите другой.")
        scheduled_time = QueueEngine.slot_time(session, payload.slot_index)
        booking = Booking(
            session_id=session.id,
            booking_token=new_token(),
            student_name=payload.student_name,
            group_name=payload.group_name,
            lab_name=payload.lab_name,
            slot_index=payload.slot_index,
            scheduled_time=scheduled_time,
            original_scheduled_time=scheduled_time,
            position=1,
            status=BookingStatus.BOOKED,
        )
        db.add(booking)
        db.flush()
        QueueEngine.recalculate(db, session)
        db.commit()
        db.refresh(booking)
        logger.info("Booking created session_id=%s booking_id=%s slot=%s", session.id, booking.id, payload.slot_index)
        return BookingConfirmation.model_validate(booking)
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Этот слот уже заняли. Выберите другой."
        ) from exc
