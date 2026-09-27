"""Add durable create-session idempotency key.

Revision ID: 0002_session_idempotency
Revises: 0001_initial
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "0002_session_idempotency"
down_revision: str | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("defense_sessions", sa.Column("idempotency_key", sa.String(length=80), nullable=True))
    op.create_index("ix_defense_sessions_idempotency_key", "defense_sessions", ["idempotency_key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_defense_sessions_idempotency_key", table_name="defense_sessions")
    op.drop_column("defense_sessions", "idempotency_key")
