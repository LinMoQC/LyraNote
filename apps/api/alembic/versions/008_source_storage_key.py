"""Add storage_key and storage_backend columns to sources table

Revision ID: 008
Revises: 007
Create Date: 2026-03-10
"""

import sqlalchemy as sa
from alembic import op

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("sources", sa.Column("storage_key", sa.String(500), nullable=True))
    op.add_column("sources", sa.Column("storage_backend", sa.String(20), nullable=True))
    op.create_index("ix_sources_storage_key", "sources", ["storage_key"])


def downgrade() -> None:
    op.drop_index("ix_sources_storage_key", table_name="sources")
    op.drop_column("sources", "storage_backend")
    op.drop_column("sources", "storage_key")
