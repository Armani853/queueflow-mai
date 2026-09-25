import csv
import io
import logging

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Booking, BookingStatus
from app.routers.helpers import get_admin_session
from app.routers.serializers import manage_payload
from app.schemas.booking import BookingPublic, BookingUpdate
from app.schemas.session import SessionManage, SessionUpdate
from app.services.queue_engine import QueueEngine


router = APIRouter(prefix="/api/manage", tags=["management"])
logger = logging.getLogger("queueflow.manage")


def owned_booking(db: Session, admin_token: str, booking_id: int) -> tuple:
    session = get_admin_session(db, admin_token)
    booking = db.scalar(
        select(Booking).where(Booking.id == booking_id, Booking.session_id == session.id)
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return session, booking


@router.get("/{admin_token}", response_model=SessionManage)
def read_dashboard(admin_token: str, db: Session = Depends(get_db)) -> SessionManage:
    session = get_admin_session(db, admin_token)
    QueueEngine.recalculate(db, session)
    return manage_payload(session)


@router.get("/{admin_token}/export.csv", response_class=Response)
def export_csv(admin_token: str, db: Session = Depends(get_db)) -> Response:
    session = get_admin_session(db, admin_token)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ФИО", "Группа", "Лабораторная", "Время", "Статус", "Примечание"])
    for booking in sorted(session.bookings, key=lambda item: (item.created_at, item.id)):
        writer.writerow([
            booking.student_name,
            booking.group_name,
            booking.lab_name,
            booking.scheduled_time.strftime("%H:%M") if booking.scheduled_time else "",
            booking.status.value,
            booking.notes or "",
        ])
    filename = f"queueflow-session-{session.id}.csv"
    logger.info("CSV exported session_id=%s rows=%s", session.id, len(session.bookings))
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch("/{admin_token}/bookings/{booking_id}", response_model=BookingPublic)
def update_booking(
    admin_token: str,
    booking_id: int,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
) -> BookingPublic:
    session, booking = owned_booking(db, admin_token, booking_id)
    if booking.status == BookingStatus.CANCELLED:
        raise HTTPException(status_code=409, detail="Отменённую запись нельзя изменить")
    if booking.status == BookingStatus.PASSED and payload.status != BookingStatus.PASSED:
        raise HTTPException(status_code=409, detail="Статус PASSED является финальным")
    if payload.status == BookingStatus.PASSED and booking.status != BookingStatus.CURRENT:
        raise HTTPException(status_code=409, detail="Сначала начните сдачу студента")
    if payload.status == BookingStatus.CURRENT:
        for other in QueueEngine.active_bookings(db, session.id):
            if other.status == BookingStatus.CURRENT and other.id != booking.id:
                other.status = BookingStatus.WAITING
    if payload.status == BookingStatus.LATE:
        QueueEngine.remove_from_schedule(db, session, booking, BookingStatus.LATE)
    elif payload.status == BookingStatus.CANCELLED:
        QueueEngine.remove_from_schedule(db, session, booking, BookingStatus.CANCELLED)
    else:
        if booking.slot_index is None:
            raise HTTPException(status_code=409, detail="Сначала перенесите студента в свободный слот")
        booking.status = payload.status
    booking.notes = payload.notes
    QueueEngine.recalculate(db, session)
    db.commit()
    db.refresh(booking)
    logger.info(
        "Booking status changed session_id=%s booking_id=%s status=%s",
        session.id,
        booking.id,
        booking.status.value,
    )
    return BookingPublic.model_validate(booking)


@router.post("/{admin_token}/bookings/{booking_id}/move", response_model=BookingPublic)
def move_booking(
    admin_token: str, booking_id: int, db: Session = Depends(get_db)
) -> BookingPublic:
    session, booking = owned_booking(db, admin_token, booking_id)
    if booking.status != BookingStatus.LATE:
        raise HTTPException(status_code=409, detail="Перенос доступен только для опоздавшего студента")
    try:
        QueueEngine.move_to_nearest_slot(db, session, booking)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    db.commit()
    db.refresh(booking)
    logger.info("Late booking moved session_id=%s booking_id=%s", session.id, booking.id)
    return BookingPublic.model_validate(booking)


@router.post("/{admin_token}/recalculate", response_model=SessionManage)
def recalculate(admin_token: str, db: Session = Depends(get_db)) -> SessionManage:
    session = get_admin_session(db, admin_token)
    QueueEngine.recalculate(db, session)
    db.commit()
    return manage_payload(session)


@router.patch("/{admin_token}/session", response_model=SessionManage)
def update_session(
    admin_token: str, payload: SessionUpdate, db: Session = Depends(get_db)
) -> SessionManage:
    session = get_admin_session(db, admin_token)
    updates = payload.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(session, key, value)
    if session.end_time and session.start_time >= session.end_time:
        raise HTTPException(status_code=422, detail="Время окончания должно быть позже начала")
    active = QueueEngine.active_bookings(db, session.id)
    if len(active) > QueueEngine.capacity(session):
        raise HTTPException(status_code=409, detail="Новый лимит меньше числа активных записей")
    QueueEngine.recalculate(db, session)
    db.commit()
    db.refresh(session)
    return manage_payload(session)


@router.delete("/{admin_token}/session", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(admin_token: str, db: Session = Depends(get_db)) -> Response:
    session = get_admin_session(db, admin_token)
    db.delete(session)
    db.commit()
    logger.info("Session deleted id=%s", session.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
