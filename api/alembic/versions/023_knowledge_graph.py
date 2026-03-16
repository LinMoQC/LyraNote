"""add knowledge graph tables

Revision ID: 023
Revises: 022
Create Date: 2026-03-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "023"
down_revision = "022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "knowledge_entities",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("mention_count", sa.Integer, server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_ke_notebook_id", "knowledge_entities", ["notebook_id"])
    op.create_index("idx_ke_notebook_name", "knowledge_entities", ["notebook_id", "name"], unique=True)

    op.create_table(
        "knowledge_relations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_entity_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("target_entity_id", UUID(as_uuid=True), sa.ForeignKey("knowledge_entities.id", ondelete="CASCADE"), nullable=False),
        sa.Column("relation_type", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("weight", sa.Float, server_default="1.0", nullable=False),
        sa.Column("source_id", UUID(as_uuid=True), sa.ForeignKey("sources.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_kr_notebook_id", "knowledge_relations", ["notebook_id"])
    op.create_index("idx_kr_source_entity", "knowledge_relations", ["source_entity_id"])
    op.create_index("idx_kr_target_entity", "knowledge_relations", ["target_entity_id"])


def downgrade() -> None:
    op.drop_table("knowledge_relations")
    op.drop_table("knowledge_entities")
