"""Add agent_thoughts and user_portraits tables

Revision ID: 033
Revises: 032
Create Date: 2026-03-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "033"
down_revision = "032"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # agent_thoughts — Lyra Soul 思维记录
    op.create_table(
        "agent_thoughts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("visibility", sa.String(20), nullable=False, server_default="internal"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("activity_context", JSONB, nullable=True),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_agent_thoughts_user_id", "agent_thoughts", ["user_id"])
    op.create_index("ix_agent_thoughts_created_at", "agent_thoughts", ["created_at"])

    # user_portraits — 用户画像（每用户一行）
    op.create_table(
        "user_portraits",
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("portrait_json", JSONB, nullable=True),
        sa.Column("synthesis_summary", sa.Text, nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("synthesized_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), onupdate=sa.text("now()"), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_portraits")
    op.drop_index("ix_agent_thoughts_created_at", table_name="agent_thoughts")
    op.drop_index("ix_agent_thoughts_user_id", table_name="agent_thoughts")
    op.drop_table("agent_thoughts")
