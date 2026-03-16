"""note-as-source: add source_type/note_id to chunks, last_indexed_hash to notes

Enables indexing user notes into the knowledge base alongside imported sources.

Revision ID: 020
Revises: 019
Create Date: 2026-03-15
"""

from alembic import op
import sqlalchemy as sa

revision = "020"
down_revision = "019"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "chunks",
        sa.Column("source_type", sa.String(20), nullable=False, server_default="source"),
    )
    op.add_column(
        "chunks",
        sa.Column("note_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_chunks_note_id",
        "chunks",
        "notes",
        ["note_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # Make source_id nullable (note-type chunks have no source)
    op.alter_column("chunks", "source_id", existing_type=sa.dialects.postgresql.UUID(), nullable=True)

    op.add_column(
        "notes",
        sa.Column("last_indexed_hash", sa.String(32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("notes", "last_indexed_hash")
    op.alter_column("chunks", "source_id", existing_type=sa.dialects.postgresql.UUID(), nullable=False)
    op.drop_constraint("fk_chunks_note_id", "chunks", type_="foreignkey")
    op.drop_column("chunks", "note_id")
    op.drop_column("chunks", "source_type")
