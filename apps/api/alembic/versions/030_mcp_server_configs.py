"""Add mcp_server_configs table for MCP tool integration

Revision ID: 030
Revises: 029
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "030"
down_revision = "029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "mcp_server_configs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=True),
        sa.Column("transport", sa.String(20), nullable=False, server_default="stdio"),
        sa.Column("command", sa.String(500), nullable=True),
        sa.Column("args", JSONB, nullable=True),
        sa.Column("url", sa.Text, nullable=True),
        sa.Column("headers", JSONB, nullable=True),
        sa.Column("env_vars", JSONB, nullable=True),
        sa.Column("is_enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_mcp_server_configs_user_id",
        "mcp_server_configs",
        ["user_id"],
    )
    op.create_index(
        "ix_mcp_server_configs_user_name",
        "mcp_server_configs",
        ["user_id", "name"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_mcp_server_configs_user_name", table_name="mcp_server_configs")
    op.drop_index("ix_mcp_server_configs_user_id", table_name="mcp_server_configs")
    op.drop_table("mcp_server_configs")
