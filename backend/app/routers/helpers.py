from fastapi import HTTPException, status
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.models import Booking, DefenseSession


def begin_queue_write(db: Session) -> None:
    """Serialize SQLite queue writes before the first read in a request."""
    if db.bind and db.bind.dialect.name == "sqlite" and not db.in_transaction():
        db.execute(text("BEGIN IMMEDIATE"))


def locked_booking(db: Session, token: str) -> tuple[DefenseSession, Booking]:
    begin_queue_write(db)
    session_id = db.scalar(select(Booking.session_id).where(Booking.booking_token == token))
    if session_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись не найдена")
    session = db.scalar(select(DefenseSession).where(DefenseSession.id == session_id).with_for_update())
    booking = db.scalar(select(Booking).where(Booking.booking_token == token).with_for_update())
    if session is None or booking is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Запись не найдена")
    return session, booking


def get_public_session(db: Session, token: str) -> DefenseSession:
    session = db.scalar(select(DefenseSession).where(DefenseSession.public_token == token))
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Очередь не найдена или больше недоступна.",
        )
    return session


def get_admin_session(db: Session, token: str, *, for_write: bool = False) -> DefenseSession:
    if for_write:
        begin_queue_write(db)
    query = select(DefenseSession).where(DefenseSession.admin_token == token)
    session = db.scalar(query.with_for_update() if for_write else query)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ссылка управления недействительна")
    return session
