"""add is_global flag to notebooks

Revision ID: 003
Revises: 002
Create Date: 2026-03-09

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "notebooks",
        sa.Column("is_global", sa.Boolean(), nullable=False, server_default="false"),
    )
    # Each user can have at most one global notebook
    op.create_index(
        "ix_notebooks_user_global",
        "notebooks",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("is_global = true"),
    )


def downgrade() -> None:
    op.drop_index("ix_notebooks_user_global", table_name="notebooks")
    op.drop_column("notebooks", "is_global")
