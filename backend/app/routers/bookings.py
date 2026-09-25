import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Booking, BookingStatus
from app.schemas.booking import BookingConfirmation
from app.services.queue_engine import QueueEngine


router = APIRouter(prefix="/api/bookings", tags=["bookings"])
logger = logging.getLogger("queueflow.bookings")


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
