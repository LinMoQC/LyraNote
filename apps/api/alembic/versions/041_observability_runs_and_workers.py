"""Add observability runs, spans, and worker heartbeats

Revision ID: 041
Revises: 040
Create Date: 2026-04-02
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "041"
down_revision = "040"
branch_labels = None
depends_on = None

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "observability_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("trace_id", sa.String(length=64), nullable=False),
        sa.Column("run_type", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("generation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("task_run_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("notebook_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata_json", json_type, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["conversation_id"], ["conversations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["generation_id"], ["message_generations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["notebook_id"], ["notebooks.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_observability_runs_trace_id", "observability_runs", ["trace_id"])
    op.create_index("ix_observability_runs_run_type", "observability_runs", ["run_type"])
    op.create_index("ix_observability_runs_status", "observability_runs", ["status"])

    op.create_table(
        "observability_spans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trace_id", sa.String(length=64), nullable=False),
        sa.Column("span_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("metadata_json", json_type, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["observability_runs.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_observability_spans_run_id", "observability_spans", ["run_id"])
    op.create_index("ix_observability_spans_trace_id", "observability_spans", ["trace_id"])

    op.create_table(
        "worker_heartbeats",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("component", sa.String(length=20), nullable=False),
        sa.Column("instance_id", sa.String(length=120), nullable=False),
        sa.Column("hostname", sa.String(length=255), nullable=False),
        sa.Column("pid", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("metadata_json", json_type, nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("component", "instance_id", name="uq_worker_heartbeat_component_instance"),
    )
    op.create_index("ix_worker_heartbeats_component", "worker_heartbeats", ["component"])


def downgrade() -> None:
    op.drop_index("ix_worker_heartbeats_component", table_name="worker_heartbeats")
    op.drop_table("worker_heartbeats")

    op.drop_index("ix_observability_spans_trace_id", table_name="observability_spans")
    op.drop_index("ix_observability_spans_run_id", table_name="observability_spans")
    op.drop_table("observability_spans")

    op.drop_index("ix_observability_runs_status", table_name="observability_runs")
    op.drop_index("ix_observability_runs_run_type", table_name="observability_runs")
    op.drop_index("ix_observability_runs_trace_id", table_name="observability_runs")
    op.drop_table("observability_runs")
