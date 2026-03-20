"""message attachments

Adds JSONB attachments column to messages table for persisting
user-uploaded file metadata (name, type, file_id).

Revision ID: 019
Revises: 018
Create Date: 2026-03-14
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("messages", sa.Column("attachments", JSONB, nullable=True))


def downgrade() -> None:
    op.drop_column("messages", "attachments")
