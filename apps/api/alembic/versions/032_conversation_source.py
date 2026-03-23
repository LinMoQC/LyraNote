"""Add source column to conversations

Revision ID: 032
Revises: 031
Create Date: 2026-03-23
"""

import sqlalchemy as sa
from alembic import op

revision = "032"
down_revision = "031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "conversations",
        sa.Column(
            "source",
            sa.String(20),
            nullable=False,
            server_default="chat",
        ),
    )


def downgrade() -> None:
    op.drop_column("conversations", "source")
