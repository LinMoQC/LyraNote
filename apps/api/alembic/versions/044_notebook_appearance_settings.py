"""Add notebook appearance settings

Revision ID: 044
Revises: 043
Create Date: 2026-04-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "044"
down_revision = "043"
branch_labels = None
depends_on = None

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.add_column("notebooks", sa.Column("appearance_settings", json_type, nullable=True))


def downgrade() -> None:
    op.drop_column("notebooks", "appearance_settings")
