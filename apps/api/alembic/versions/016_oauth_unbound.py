"""add oauth_unbound to users

Revision ID: 016
Revises: 015
Create Date: 2026-03-12
"""
from alembic import op
import sqlalchemy as sa

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("users", sa.Column("oauth_unbound", sa.String(64), nullable=True))


def downgrade():
    op.drop_column("users", "oauth_unbound")
