"""Initial QueueFlow schema."""
from typing import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "0001_initial"
down_revision: str | None = None
branch_labels: Sequence[str] | None = None
depends_on: Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "defense_sessions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("public_token", sa.String(80), nullable=False),
        sa.Column("admin_token", sa.String(80), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("subject", sa.String(120), nullable=False),
        sa.Column("session_date", sa.Date(), nullable=False),
        sa.Column("start_time", sa.Time(), nullable=False),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("room", sa.String(80), nullable=False),
        sa.Column("slot_duration_minutes", sa.Integer(), nullable=False),
        sa.Column("buffer_minutes", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_students", sa.Integer(), nullable=False),
        sa.Column("queue_mode", sa.Enum("COMPACT", "KEEP_TIME", name="queuemode"), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("slot_duration_minutes > 0", name="ck_session_slot_positive"),
        sa.CheckConstraint("buffer_minutes >= 0", name="ck_session_buffer_nonnegative"),
        sa.CheckConstraint("max_students > 0", name="ck_session_max_positive"),
        sa.UniqueConstraint("public_token"),
        sa.UniqueConstraint("admin_token"),
    )
    op.create_index("ix_defense_sessions_public_token", "defense_sessions", ["public_token"])
    op.create_index("ix_defense_sessions_admin_token", "defense_sessions", ["admin_token"])
    op.create_table(
        "bookings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("session_id", sa.Integer(), sa.ForeignKey("defense_sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_token", sa.String(80), nullable=False),
        sa.Column("student_name", sa.String(120), nullable=False),
        sa.Column("group_name", sa.String(40), nullable=False),
        sa.Column("lab_name", sa.String(120), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("slot_index", sa.Integer(), nullable=True),
        sa.Column("scheduled_time", sa.Time(), nullable=True),
        sa.Column("original_scheduled_time", sa.Time(), nullable=True),
        sa.Column("status", sa.Enum("BOOKED", "WAITING", "CURRENT", "PASSED", "CANCELLED", "LATE", name="bookingstatus"), nullable=False),
        sa.Column("notes", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("booking_token"),
        sa.UniqueConstraint("session_id", "slot_index", name="uq_booking_active_slot"),
    )
    op.create_index("ix_bookings_session_id", "bookings", ["session_id"])
    op.create_index("ix_bookings_booking_token", "bookings", ["booking_token"])


def downgrade() -> None:
    op.drop_table("bookings")
    op.drop_table("defense_sessions")

