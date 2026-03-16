"""Add conversation_summaries table for rolling context compression

Revision ID: 007
Revises: 006
Create Date: 2026-03-10
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "conversation_summaries",
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="CASCADE"),
            primary_key=True,
            nullable=False,
        ),
        sa.Column("summary_text", sa.Text, nullable=False),
        sa.Column("compressed_message_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("compressed_through", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            onupdate=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("conversation_summaries")
