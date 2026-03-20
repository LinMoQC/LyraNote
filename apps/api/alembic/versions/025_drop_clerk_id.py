"""drop legacy clerk_id column from users

Revision ID: 025
Revises: 024
Create Date: 2026-03-18
"""

from alembic import op
import sqlalchemy as sa

revision = "025"
down_revision = "024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("users_clerk_id_key", "users", type_="unique")
    op.drop_column("users", "clerk_id")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("clerk_id", sa.String(255), unique=True, nullable=True),
    )
