"""Add observability llm and tool call detail tables

Revision ID: 043
Revises: 042
Create Date: 2026-04-02
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "043"
down_revision = "042"
branch_labels = None
depends_on = None

json_type = sa.JSON().with_variant(postgresql.JSONB(astext_type=sa.Text()), "postgresql")


def upgrade() -> None:
    op.create_table(
        "observability_llm_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trace_id", sa.String(length=64), nullable=False),
        sa.Column("call_type", sa.String(length=40), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("finish_reason", sa.String(length=40), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("reasoning_tokens", sa.Integer(), nullable=True),
        sa.Column("cached_tokens", sa.Integer(), nullable=True),
        sa.Column("ttft_ms", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("prompt_snapshot", json_type, nullable=True),
        sa.Column("response_snapshot", json_type, nullable=True),
        sa.Column("metadata_json", json_type, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["observability_runs.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_observability_llm_calls_run_id", "observability_llm_calls", ["run_id"])
    op.create_index("ix_observability_llm_calls_trace_id", "observability_llm_calls", ["trace_id"])

    op.create_table(
        "observability_tool_calls",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("run_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("trace_id", sa.String(length=64), nullable=False),
        sa.Column("tool_name", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("cache_hit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("result_count", sa.Integer(), nullable=True),
        sa.Column("followup_tool_hint", sa.String(length=120), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("input_snapshot", json_type, nullable=True),
        sa.Column("output_snapshot", json_type, nullable=True),
        sa.Column("metadata_json", json_type, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["observability_runs.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_observability_tool_calls_run_id", "observability_tool_calls", ["run_id"])
    op.create_index("ix_observability_tool_calls_trace_id", "observability_tool_calls", ["trace_id"])


def downgrade() -> None:
    op.drop_index("ix_observability_tool_calls_trace_id", table_name="observability_tool_calls")
    op.drop_index("ix_observability_tool_calls_run_id", table_name="observability_tool_calls")
    op.drop_table("observability_tool_calls")

    op.drop_index("ix_observability_llm_calls_trace_id", table_name="observability_llm_calls")
    op.drop_index("ix_observability_llm_calls_run_id", table_name="observability_llm_calls")
    op.drop_table("observability_llm_calls")
