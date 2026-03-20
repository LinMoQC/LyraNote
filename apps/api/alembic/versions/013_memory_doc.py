"""add memory_doc table (single-user global memory text)

Revision ID: 013
Revises: 012
Create Date: 2026-03-11
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. New memory_doc table (single-row global memory text)
    op.create_table(
        "memory_doc",
        sa.Column("id", sa.UUID(as_uuid=True), primary_key=True),
        sa.Column("content_md", sa.Text, nullable=False, server_default=""),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    # 2. Add is_system + system_type columns to notebooks
    op.add_column("notebooks", sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("notebooks", sa.Column("system_type", sa.String(50), nullable=True))


def downgrade() -> None:
    op.drop_column("notebooks", "system_type")
    op.drop_column("notebooks", "is_system")
    op.drop_table("memory_doc")
