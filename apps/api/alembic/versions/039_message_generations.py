"""Add durable message generations

Revision ID: 039
Revises: 038
Create Date: 2026-04-01
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "039"
down_revision = "038"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "message_generations",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_message_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("assistant_message_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="running"),
        sa.Column("model", sa.String(length=100), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("last_event_index", sa.Integer(), nullable=False, server_default="-1"),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_message_generations_conversation_started_at",
        "message_generations",
        ["conversation_id", "started_at"],
        unique=False,
    )
    op.create_index(
        "ix_message_generations_user_status",
        "message_generations",
        ["user_id", "status"],
        unique=False,
    )

    op.create_table(
        "message_generation_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("generation_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("event_index", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["generation_id"], ["message_generations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("generation_id", "event_index", name="uq_message_generation_events_generation_index"),
    )
    op.create_index(
        "ix_message_generation_events_generation_created_at",
        "message_generation_events",
        ["generation_id", "created_at"],
        unique=False,
    )

    op.add_column(
        "messages",
        sa.Column("generation_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "messages",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="completed"),
    )
    op.create_foreign_key(
        "fk_messages_generation_id",
        "messages",
        "message_generations",
        ["generation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_messages_conversation_status_created_at",
        "messages",
        ["conversation_id", "status", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_messages_conversation_status_created_at", table_name="messages")
    op.drop_constraint("fk_messages_generation_id", "messages", type_="foreignkey")
    op.drop_column("messages", "status")
    op.drop_column("messages", "generation_id")

    op.drop_index("ix_message_generation_events_generation_created_at", table_name="message_generation_events")
    op.drop_table("message_generation_events")

    op.drop_index("ix_message_generations_user_status", table_name="message_generations")
    op.drop_index("ix_message_generations_conversation_started_at", table_name="message_generations")
    op.drop_table("message_generations")
