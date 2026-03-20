"""restore unique index on user_memories (user_id, key)

The bcd2ff1941ab migration accidentally dropped this index.
Without it, ON CONFLICT (user_id, key) in update_user_preference tool fails
and aborts the entire DB transaction, breaking message persistence.

Revision ID: 005
Revises: 004
Create Date: 2026-03-10

"""
from typing import Sequence, Union

from alembic import op

revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_user_memories_user_key",
        "user_memories",
        ["user_id", "key"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_user_memories_user_key", table_name="user_memories")
