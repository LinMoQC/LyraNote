"""add speed to messages

Revision ID: 029
Revises: 028
Create Date: 2026-03-21
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "029"
down_revision = "028"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("speed", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "speed")
