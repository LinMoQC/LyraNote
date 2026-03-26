"""Make conversations.notebook_id nullable for notebook-free chat

Revision ID: 035
Revises: 034
Create Date: 2026-03-25
"""

import sqlalchemy as sa
from alembic import op

revision = "035"
down_revision = "034"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Make notebook_id nullable
    op.alter_column("conversations", "notebook_id", nullable=True)

    # Rebuild FK: ON DELETE CASCADE → ON DELETE SET NULL
    # (notebook deletion no longer cascades to delete conversations)
    op.drop_constraint("conversations_notebook_id_fkey", "conversations", type_="foreignkey")
    op.create_foreign_key(
        "conversations_notebook_id_fkey",
        "conversations",
        "notebooks",
        ["notebook_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    # Revert FK to CASCADE and make column non-nullable again
    op.drop_constraint("conversations_notebook_id_fkey", "conversations", type_="foreignkey")
    op.create_foreign_key(
        "conversations_notebook_id_fkey",
        "conversations",
        "notebooks",
        ["notebook_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Note: rows with notebook_id IS NULL must be cleaned up before downgrade
    op.alter_column("conversations", "notebook_id", nullable=False)
