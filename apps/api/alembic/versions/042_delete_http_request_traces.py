"""Delete http_request traces from observability_runs and their spans

Revision ID: 042
Revises: 041
Create Date: 2026-04-02
"""

from alembic import op

revision = "042"
down_revision = "041"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Delete spans belonging to http_request runs first (FK constraint)
    op.execute("""
        DELETE FROM observability_spans
        WHERE trace_id IN (
            SELECT trace_id FROM observability_runs WHERE run_type = 'http_request'
        )
    """)
    # Delete the runs themselves
    op.execute("DELETE FROM observability_runs WHERE run_type = 'http_request'")


def downgrade() -> None:
    # Data deletion is not reversible
    pass
