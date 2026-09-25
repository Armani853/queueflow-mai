from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import DefenseSession


def get_public_session(db: Session, token: str) -> DefenseSession:
    session = db.scalar(select(DefenseSession).where(DefenseSession.public_token == token))
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Очередь не найдена или больше недоступна.",
        )
    return session


def get_admin_session(db: Session, token: str) -> DefenseSession:
    session = db.scalar(select(DefenseSession).where(DefenseSession.admin_token == token))
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ссылка управления недействительна")
    return session
