"""Add avatar_url column to user_portraits

Revision ID: 037
Revises: 036
Create Date: 2026-03-30
"""

import sqlalchemy as sa
from alembic import op

revision = "037"
down_revision = "036"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_portraits",
        sa.Column("avatar_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_portraits", "avatar_url")
