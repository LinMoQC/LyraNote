"""Harden observability trace schema for ops workflows

Revision ID: 045
Revises: 044
Create Date: 2026-04-24
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "045"
down_revision = "044"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "observability_spans",
        sa.Column("parent_span_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "observability_spans",
        sa.Column("component", sa.String(length=20), nullable=True),
    )
    op.add_column(
        "observability_spans",
        sa.Column("span_kind", sa.String(length=20), nullable=True),
    )
    op.create_foreign_key(
        "fk_observability_spans_parent_span_id",
        "observability_spans",
        "observability_spans",
        ["parent_span_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index("ix_observability_runs_started_at", "observability_runs", ["started_at"])
    op.create_index(
        "ix_observability_runs_run_type_started_at",
        "observability_runs",
        ["run_type", "started_at"],
    )
    op.create_index(
        "ix_observability_runs_status_started_at",
        "observability_runs",
        ["status", "started_at"],
    )
    op.create_index("ix_observability_runs_user_id", "observability_runs", ["user_id"])
    op.create_index(
        "ix_observability_runs_conversation_id",
        "observability_runs",
        ["conversation_id"],
    )
    op.create_index(
        "ix_observability_runs_generation_id",
        "observability_runs",
        ["generation_id"],
    )
    op.create_index("ix_observability_runs_task_id", "observability_runs", ["task_id"])
    op.create_index(
        "ix_observability_runs_task_run_id",
        "observability_runs",
        ["task_run_id"],
    )
    op.create_index(
        "ix_observability_runs_notebook_id",
        "observability_runs",
        ["notebook_id"],
    )

    op.create_index(
        "ix_observability_spans_parent_span_id",
        "observability_spans",
        ["parent_span_id"],
    )
    op.create_index("ix_observability_spans_started_at", "observability_spans", ["started_at"])
    op.create_index(
        "ix_observability_spans_trace_id_started_at",
        "observability_spans",
        ["trace_id", "started_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_observability_spans_trace_id_started_at", table_name="observability_spans")
    op.drop_index("ix_observability_spans_started_at", table_name="observability_spans")
    op.drop_index("ix_observability_spans_parent_span_id", table_name="observability_spans")

    op.drop_index("ix_observability_runs_notebook_id", table_name="observability_runs")
    op.drop_index("ix_observability_runs_task_run_id", table_name="observability_runs")
    op.drop_index("ix_observability_runs_task_id", table_name="observability_runs")
    op.drop_index("ix_observability_runs_generation_id", table_name="observability_runs")
    op.drop_index("ix_observability_runs_conversation_id", table_name="observability_runs")
    op.drop_index("ix_observability_runs_user_id", table_name="observability_runs")
    op.drop_index("ix_observability_runs_status_started_at", table_name="observability_runs")
    op.drop_index("ix_observability_runs_run_type_started_at", table_name="observability_runs")
    op.drop_index("ix_observability_runs_started_at", table_name="observability_runs")

    op.drop_constraint(
        "fk_observability_spans_parent_span_id",
        "observability_spans",
        type_="foreignkey",
    )
    op.drop_column("observability_spans", "span_kind")
    op.drop_column("observability_spans", "component")
    op.drop_column("observability_spans", "parent_span_id")
