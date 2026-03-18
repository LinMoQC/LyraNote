"""add research_tasks table for background deep-research

Revision ID: 026
Revises: 025
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "research_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notebook_id", sa.String(100), nullable=True),
        sa.Column("query", sa.Text, nullable=False),
        sa.Column("mode", sa.String(20), server_default="quick"),
        sa.Column("status", sa.String(20), server_default="running"),
        sa.Column("report", sa.Text, nullable=True),
        sa.Column("deliverable_json", JSONB, nullable=True),
        sa.Column("timeline_json", JSONB, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("research_tasks")
