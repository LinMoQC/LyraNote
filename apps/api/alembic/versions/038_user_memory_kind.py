"""Add memory_kind to user_memories

Revision ID: 038
Revises: 037
Create Date: 2026-04-01
"""

import sqlalchemy as sa
from alembic import op

revision = "038"
down_revision = "037"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_memories",
        sa.Column("memory_kind", sa.String(length=32), nullable=True),
    )
    op.execute("UPDATE user_memories SET memory_kind = 'preference' WHERE memory_type = 'preference'")
    op.execute(
        "UPDATE user_memories SET memory_kind = 'project_state' "
        "WHERE memory_kind IS NULL AND memory_type IN ('fact', 'skill')"
    )
    op.alter_column("user_memories", "memory_kind", nullable=False)


def downgrade() -> None:
    op.drop_column("user_memories", "memory_kind")
