"""Add discovered_tools cache columns to mcp_server_configs

Revision ID: 031
Revises: 030
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "031"
down_revision = "030"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "mcp_server_configs",
        sa.Column("discovered_tools", JSONB, nullable=True),
    )
    op.add_column(
        "mcp_server_configs",
        sa.Column("tools_discovered_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("mcp_server_configs", "tools_discovered_at")
    op.drop_column("mcp_server_configs", "discovered_tools")
