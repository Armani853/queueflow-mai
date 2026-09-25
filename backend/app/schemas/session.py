from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import QueueMode
from app.schemas.booking import BookingPublic, SlotPublic


class SessionCreate(BaseModel):
    title: str = Field(min_length=2, max_length=120)
    subject: str = Field(min_length=2, max_length=120)
    session_date: date
    start_time: time
    end_time: time | None = None
    room: str = Field(min_length=1, max_length=80)
    slot_duration_minutes: int = Field(ge=1, le=180)
    buffer_minutes: int = Field(default=0, ge=0, le=60)
    max_students: int = Field(ge=1, le=200)
    queue_mode: QueueMode = QueueMode.COMPACT

    @model_validator(mode="after")
    def validate_times(self) -> "SessionCreate":
        if self.end_time and self.start_time >= self.end_time:
            raise ValueError("Время окончания должно быть позже времени начала")
        return self


class SessionUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=120)
    subject: str | None = Field(default=None, min_length=2, max_length=120)
    session_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    room: str | None = Field(default=None, min_length=1, max_length=80)
    slot_duration_minutes: int | None = Field(default=None, ge=1, le=180)
    buffer_minutes: int | None = Field(default=None, ge=0, le=60)
    max_students: int | None = Field(default=None, ge=1, le=200)
    is_active: bool | None = None


class SessionBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    title: str
    subject: str
    session_date: date
    start_time: time
    end_time: time | None
    room: str
    slot_duration_minutes: int
    buffer_minutes: int
    max_students: int
    queue_mode: QueueMode
    is_active: bool
    created_at: datetime
    updated_at: datetime


class SessionPublic(SessionBase):
    public_token: str
    slots: list[SlotPublic]
    bookings: list[BookingPublic]
    current: BookingPublic | None = None
    next_booking: BookingPublic | None = None


class SessionCreated(SessionPublic):
    admin_token: str
    public_path: str
    manage_path: str


class SessionManage(SessionPublic):
    admin_token: str

