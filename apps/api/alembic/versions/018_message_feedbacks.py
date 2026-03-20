"""message feedbacks

Adds message_feedbacks table for user like/dislike feedback on assistant replies.

Revision ID: 018
Revises: 017
Create Date: 2026-03-13
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_feedbacks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "message_id",
            UUID(as_uuid=True),
            sa.ForeignKey("messages.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("rating", sa.String(20), nullable=False),
        sa.Column("comment", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_message_feedbacks_user_message",
        "message_feedbacks",
        ["user_id", "message_id"],
        unique=True,
    )
    op.create_index(
        "ix_message_feedbacks_message_id",
        "message_feedbacks",
        ["message_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_message_feedbacks_message_id", table_name="message_feedbacks")
    op.drop_index("ix_message_feedbacks_user_message", table_name="message_feedbacks")
    op.drop_table("message_feedbacks")
