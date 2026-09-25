import secrets

from app.config import settings


def new_token() -> str:
    return secrets.token_urlsafe(settings.token_bytes)

