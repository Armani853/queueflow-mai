import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Booking, BookingStatus
from app.schemas.booking import BookingConfirmation
from app.schemas.session import SessionPublic
from app.routers.serializers import public_payload
from app.services.queue_engine import QueueEngine


router = APIRouter(prefix="/api/bookings", tags=["bookings"])
logger = logging.getLogger("queueflow.bookings")


def server_now() -> datetime:
    return datetime.now(settings.timezone_info)


@router.post("/{booking_token}/complete", response_model=SessionPublic)
def complete_booking(booking_token: str, db: Session = Depends(get_db)) -> SessionPublic:
    try:
        if db.bind and db.bind.dialect.name == "sqlite":
            db.execute(text("BEGIN IMMEDIATE"))
        booking = db.scalar(
            select(Booking)
            .where(Booking.booking_token == booking_token)
            .with_for_update()
        )
        if not booking:
            raise HTTPException(status_code=404, detail="Запись не найдена")
        session = booking.session
        if booking.status == BookingStatus.PASSED and booking.actual_finished_at:
            return public_payload(session)
        if not session.is_active:
            raise HTTPException(status_code=409, detail="Эта очередь закрыта")
        if booking.status == BookingStatus.CANCELLED:
            raise HTTPException(status_code=409, detail="Отменённую запись нельзя завершить")
        if booking.status == BookingStatus.PASSED:
            raise HTTPException(status_code=409, detail="Эта запись уже отмечена как сданная")
        if booking.status != BookingStatus.CURRENT:
            raise HTTPException(status_code=409, detail="Кнопка «Я сдал» доступна только текущему студенту")
        QueueEngine.complete_booking(db, session, booking, server_now())
        db.commit()
        db.refresh(booking)
        logger.info(
            "Booking self-completed session_id=%s booking_id=%s",
            booking.session_id,
            booking.id,
        )
        return public_payload(session)
    except HTTPException:
        db.rollback()
        raise


@router.get("/{booking_token}", response_model=BookingConfirmation)
def read_booking(booking_token: str, db: Session = Depends(get_db)) -> BookingConfirmation:
    booking = db.scalar(select(Booking).where(Booking.booking_token == booking_token))
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return BookingConfirmation.model_validate(booking)


@router.delete("/{booking_token}", response_model=BookingConfirmation)
def cancel_booking(booking_token: str, db: Session = Depends(get_db)) -> BookingConfirmation:
    booking = db.scalar(select(Booking).where(Booking.booking_token == booking_token))
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    if booking.status in {BookingStatus.CANCELLED, BookingStatus.PASSED}:
        raise HTTPException(status_code=409, detail="Эту запись уже нельзя отменить")
    QueueEngine.remove_from_schedule(db, booking.session, booking, BookingStatus.CANCELLED)
    db.commit()
    db.refresh(booking)
    logger.info("Booking cancelled session_id=%s booking_id=%s", booking.session_id, booking.id)
    return BookingConfirmation.model_validate(booking)
import logging
