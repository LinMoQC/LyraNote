"""add public notebook fields

Revision ID: 022
Revises: 021
Create Date: 2026-03-15
"""

from alembic import op
import sqlalchemy as sa

revision = "022"
down_revision = "021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notebooks", sa.Column("is_public", sa.Boolean, server_default="false", nullable=False))
    op.add_column("notebooks", sa.Column("published_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("notebooks", sa.Column("cover_emoji", sa.String(10), nullable=True))
    op.add_column("notebooks", sa.Column("cover_gradient", sa.String(50), nullable=True))
    op.create_index("idx_notebooks_is_public", "notebooks", ["is_public"])


def downgrade() -> None:
    op.drop_index("idx_notebooks_is_public", "notebooks")
    op.drop_column("notebooks", "cover_gradient")
    op.drop_column("notebooks", "cover_emoji")
    op.drop_column("notebooks", "published_at")
    op.drop_column("notebooks", "is_public")
