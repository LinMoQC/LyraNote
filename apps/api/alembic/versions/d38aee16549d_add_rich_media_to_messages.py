"""add_rich_media_to_messages

Revision ID: d38aee16549d
Revises: 032
Create Date: 2026-03-23 16:52:54.509737

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'd38aee16549d'
down_revision: Union[str, None] = '032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('messages', sa.Column('mind_map', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('messages', sa.Column('diagram', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('messages', sa.Column('mcp_result', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('messages', sa.Column('ui_elements', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('messages', 'ui_elements')
    op.drop_column('messages', 'mcp_result')
    op.drop_column('messages', 'diagram')
    op.drop_column('messages', 'mind_map')
