"""make clerk_id nullable (single-user mode)

Revision ID: 012
Revises: 011
Create Date: 2026-03-10
"""
from alembic import op

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "clerk_id", nullable=True)


def downgrade() -> None:
    op.alter_column("users", "clerk_id", nullable=False)
