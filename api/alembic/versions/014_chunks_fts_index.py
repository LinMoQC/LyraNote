"""add tsvector GIN index to chunks.content for FTS hybrid search

Revision ID: 014
Revises: 013
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add tsvector generated column for Chinese/multilingual full-text search
    # Using 'simple' config as Chinese tokenization requires pg_jieba or similar;
    # 'simple' still supports keyword substring matching.
    op.execute("""
        ALTER TABLE chunks
        ADD COLUMN IF NOT EXISTS content_tsv tsvector
        GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS chunks_content_tsv_idx
        ON chunks USING GIN(content_tsv)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS chunks_content_tsv_idx")
    op.execute("ALTER TABLE chunks DROP COLUMN IF EXISTS content_tsv")
