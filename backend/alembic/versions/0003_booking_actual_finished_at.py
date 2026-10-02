"""Store the server timestamp of student self-completion.

Revision ID: 0003_booking_actual_finished_at
Revises: 0002_session_idempotency
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0003_booking_actual_finished_at"
down_revision: str | None = "0002_session_idempotency"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("actual_finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bookings", "actual_finished_at")
