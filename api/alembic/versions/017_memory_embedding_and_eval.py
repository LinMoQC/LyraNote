"""memory embedding fields and agent_evaluations table

Adds pre-computed embedding storage to user_memories (for ANN retrieval),
introduces source/evidence/conflict_flag audit fields, adjusts the unique
index from (user_id, key) → (user_id, key, source) to allow the same key
from multiple sources, and creates the agent_evaluations table for
lightweight async conversation quality scoring.

Revision ID: 017
Revises: 016
Create Date: 2026-03-12
"""

from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects.postgresql import UUID

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------
    # 1. Add new columns to user_memories
    # ------------------------------------------------------------------
    op.add_column(
        "user_memories",
        sa.Column("embedding", Vector(1536), nullable=True),
    )
    op.add_column(
        "user_memories",
        sa.Column(
            "source",
            sa.String(20),
            nullable=False,
            server_default="conversation",
        ),
    )
    op.add_column(
        "user_memories",
        sa.Column("evidence", sa.Text, nullable=True),
    )
    op.add_column(
        "user_memories",
        sa.Column(
            "conflict_flag",
            sa.Boolean,
            nullable=False,
            server_default="false",
        ),
    )

    # ------------------------------------------------------------------
    # 2. Backfill existing rows: mark all as source='conversation'
    #    (server_default covers new inserts; existing rows need explicit update)
    # ------------------------------------------------------------------
    op.execute("UPDATE user_memories SET source = 'conversation' WHERE source IS NULL")

    # ------------------------------------------------------------------
    # 3. Swap unique index: (user_id, key) → (user_id, key, source)
    #    This allows the same logical key from different sources
    #    (e.g., conversation vs. file) to coexist as separate rows.
    # ------------------------------------------------------------------
    op.drop_index("ix_user_memories_user_key", table_name="user_memories")
    op.create_index(
        "ix_user_memories_user_key_source",
        "user_memories",
        ["user_id", "key", "source"],
        unique=True,
    )

    # ------------------------------------------------------------------
    # 4. HNSW index for ANN retrieval on memory embeddings
    #    Created sparse (NULLs excluded); populated by backfill script.
    #    Using hnsw because it requires no list-count tuning unlike ivfflat.
    # ------------------------------------------------------------------
    op.execute(
        "CREATE INDEX ix_user_memories_embedding_hnsw "
        "ON user_memories USING hnsw (embedding vector_cosine_ops) "
        "WHERE embedding IS NOT NULL"
    )

    # ------------------------------------------------------------------
    # 5. Create agent_evaluations table
    # ------------------------------------------------------------------
    op.create_table(
        "agent_evaluations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "conversation_id",
            UUID(as_uuid=True),
            sa.ForeignKey("conversations.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("overall_score", sa.Float, nullable=True),
        sa.Column("relevance_score", sa.Float, nullable=True),
        sa.Column("evidence_score", sa.Float, nullable=True),
        sa.Column("actionability_score", sa.Float, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_agent_evaluations_user_id",
        "agent_evaluations",
        ["user_id"],
    )
    op.create_index(
        "ix_agent_evaluations_conversation_id",
        "agent_evaluations",
        ["conversation_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_agent_evaluations_conversation_id", table_name="agent_evaluations")
    op.drop_index("ix_agent_evaluations_user_id", table_name="agent_evaluations")
    op.drop_table("agent_evaluations")

    op.execute("DROP INDEX IF EXISTS ix_user_memories_embedding_hnsw")
    op.drop_index("ix_user_memories_user_key_source", table_name="user_memories")
    op.create_index(
        "ix_user_memories_user_key",
        "user_memories",
        ["user_id", "key"],
        unique=True,
    )

    op.drop_column("user_memories", "conflict_flag")
    op.drop_column("user_memories", "evidence")
    op.drop_column("user_memories", "source")
    op.drop_column("user_memories", "embedding")
