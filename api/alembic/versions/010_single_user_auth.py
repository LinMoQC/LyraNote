"""single user auth: add password_hash to users, add app_config table

Revision ID: 010
Revises: 009
Create Date: 2026-03-10
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("password_hash", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("username", sa.String(255), nullable=True))

    op.create_table(
        "app_config",
        sa.Column("key", sa.String(255), primary_key=True),
        sa.Column("value", sa.Text, nullable=True),
    )
    op.execute("INSERT INTO app_config (key, value) VALUES ('is_configured', 'false')")


def downgrade() -> None:
    op.drop_column("users", "password_hash")
    op.drop_column("users", "username")
    op.drop_table("app_config")
