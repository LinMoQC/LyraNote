"""add google_id and github_id to users

Revision ID: 015
Revises: 014
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("google_id", sa.String(255), unique=True, nullable=True))
    op.add_column("users", sa.Column("github_id", sa.String(255), unique=True, nullable=True))


def downgrade():
    op.drop_column("users", "github_id")
    op.drop_column("users", "google_id")
