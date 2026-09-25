from datetime import datetime, time

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models import BookingStatus


def clean_text(value: str) -> str:
    cleaned = " ".join(value.split())
    if not cleaned:
        raise ValueError("Поле не может быть пустым")
    return cleaned


class BookingCreate(BaseModel):
    student_name: str = Field(min_length=2, max_length=120)
    group_name: str = Field(min_length=1, max_length=40)
    lab_name: str = Field(min_length=1, max_length=120)
    slot_index: int = Field(ge=0)

    _clean_name = field_validator("student_name", "group_name", "lab_name")(clean_text)


class BookingUpdate(BaseModel):
    status: BookingStatus
    notes: str | None = Field(default=None, max_length=300)


class BookingPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    student_name: str
    group_name: str
    lab_name: str
    position: int
    slot_index: int | None
    scheduled_time: time | None
    status: BookingStatus
    notes: str | None
    created_at: datetime


class BookingConfirmation(BookingPublic):
    booking_token: str


class SlotPublic(BaseModel):
    index: int
    time: time
    available: bool
    booking: BookingPublic | None = None

