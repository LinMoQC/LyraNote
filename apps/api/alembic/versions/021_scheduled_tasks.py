"""scheduled tasks and proactive insights

Revision ID: 021
Revises: 020
Create Date: 2026-03-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "021"
down_revision = "020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scheduled_tasks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("task_type", sa.String(50), nullable=False, server_default="news_digest"),
        sa.Column("schedule_cron", sa.String(100), nullable=False),
        sa.Column("timezone", sa.String(50), server_default="Asia/Shanghai"),
        sa.Column("parameters", JSONB, server_default="{}"),
        sa.Column("delivery_config", JSONB, server_default="{}"),
        sa.Column("enabled", sa.Boolean, server_default="true"),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_run_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("run_count", sa.Integer, server_default="0"),
        sa.Column("last_result", sa.Text, nullable=True),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.Column("consecutive_failures", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("idx_scheduled_tasks_next_run", "scheduled_tasks", ["enabled", "next_run_at"])
    op.create_index("idx_scheduled_tasks_user", "scheduled_tasks", ["user_id"])

    op.create_table(
        "scheduled_task_runs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("task_id", UUID(as_uuid=True), sa.ForeignKey("scheduled_tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("result_summary", sa.Text, nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("generated_content", sa.Text, nullable=True),
        sa.Column("sources_count", sa.Integer, server_default="0"),
        sa.Column("delivery_status", JSONB, nullable=True),
    )

    op.create_table(
        "proactive_insights",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("notebook_id", UUID(as_uuid=True), sa.ForeignKey("notebooks.id", ondelete="CASCADE"), nullable=True),
        sa.Column("insight_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("metadata", JSONB, nullable=True),
        sa.Column("is_read", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("proactive_insights")
    op.drop_table("scheduled_task_runs")
    op.drop_index("idx_scheduled_tasks_user", "scheduled_tasks")
    op.drop_index("idx_scheduled_tasks_next_run", "scheduled_tasks")
    op.drop_table("scheduled_tasks")
