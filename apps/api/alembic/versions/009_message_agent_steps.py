"""add agent_steps to messages

Revision ID: 009
Revises: 008
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("agent_steps", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "agent_steps")
