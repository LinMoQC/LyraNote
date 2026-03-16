"""memory system v2: extend user_memories + add agent_reflections

Revision ID: 004
Revises: 003
Create Date: 2026-03-10

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "004"
down_revision: Union[str, None] = "bcd2ff1941ab"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- Extend user_memories table --
    op.add_column(
        "user_memories",
        sa.Column("memory_type", sa.String(20), server_default="preference", nullable=False),
    )
    op.add_column(
        "user_memories",
        sa.Column("access_count", sa.Integer, server_default="0", nullable=False),
    )
    op.add_column(
        "user_memories",
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "user_memories",
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "user_memories",
        sa.Column("reinforced_by", sa.String(36), nullable=True),
    )

    # -- Create agent_reflections table (L5) --
    op.create_table(
        "agent_reflections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("scene", sa.String(20), nullable=True),
        sa.Column("quality_score", sa.Float, nullable=True),
        sa.Column("what_worked", sa.Text, nullable=True),
        sa.Column("what_failed", sa.Text, nullable=True),
        sa.Column("memory_reinforced", JSONB, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_agent_reflections_user_id",
        "agent_reflections",
        ["user_id"],
    )
    op.create_index(
        "ix_agent_reflections_created_at",
        "agent_reflections",
        ["created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_agent_reflections_created_at", table_name="agent_reflections")
    op.drop_index("ix_agent_reflections_user_id", table_name="agent_reflections")
    op.drop_table("agent_reflections")

    op.drop_column("user_memories", "reinforced_by")
    op.drop_column("user_memories", "expires_at")
    op.drop_column("user_memories", "last_accessed_at")
    op.drop_column("user_memories", "access_count")
    op.drop_column("user_memories", "memory_type")
