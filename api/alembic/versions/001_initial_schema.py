"""initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID
from pgvector.sqlalchemy import Vector

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("clerk_id", sa.String(255), unique=True, nullable=False),
        sa.Column("email", sa.String(255)),
        sa.Column("name", sa.String(255)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "notebooks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("status", sa.String(50), server_default="active"),
        sa.Column("source_count", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notebooks_user_id", "notebooks", ["user_id"])

    op.create_table(
        "sources",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500)),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("file_path", sa.Text),
        sa.Column("url", sa.Text),
        sa.Column("raw_text", sa.Text),
        sa.Column("summary", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_sources_notebook_id", "sources", ["notebook_id"])

    op.create_table(
        "chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("chunk_index", sa.Integer, server_default="0"),
        sa.Column("embedding", Vector(1536)),
        sa.Column("token_count", sa.Integer),
        sa.Column("metadata", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_chunks_notebook_id", "chunks", ["notebook_id"])
    op.create_index("ix_chunks_source_id", "chunks", ["source_id"])
    # IVFFlat index for approximate nearest neighbor search
    op.execute(
        "CREATE INDEX ix_chunks_embedding ON chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)"
    )

    op.create_table(
        "notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500)),
        sa.Column("content_json", JSONB),
        sa.Column("content_text", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_notes_notebook_id", "notes", ["notebook_id"])

    op.create_table(
        "conversations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "messages",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("conversation_id", UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(50), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("citations", JSONB),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_messages_conversation_id", "messages", ["conversation_id"])

    op.create_table(
        "artifacts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("title", sa.String(500)),
        sa.Column("content_md", sa.Text),
        sa.Column("status", sa.String(50), server_default="pending"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_artifacts_notebook_id", "artifacts", ["notebook_id"])

    op.create_table(
        "agent_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("type", sa.String(100), nullable=False),
        sa.Column("status", sa.String(50), server_default="queued"),
        sa.Column("input_data", JSONB),
        sa.Column("output_data", JSONB),
        sa.Column("error", sa.Text),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("agent_runs")
    op.drop_table("artifacts")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("notes")
    op.drop_table("chunks")
    op.drop_table("sources")
    op.drop_table("notebooks")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS vector")
