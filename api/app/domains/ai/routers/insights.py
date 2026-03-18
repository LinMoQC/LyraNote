"""Proactive insights endpoints."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import InsightOut, InsightsListOut
from app.schemas.response import ApiResponse, success

router = APIRouter()


@router.get("/insights", response_model=ApiResponse[InsightsListOut])
async def list_insights(current_user: CurrentUser, db: DbDep):
    """Fetch recent proactive insights, keeping only the latest per task."""
    from app.models import ProactiveInsight

    result = await db.execute(
        select(ProactiveInsight)
        .where(
            ProactiveInsight.user_id == current_user.id,
            ProactiveInsight.is_read == False,  # noqa: E712
        )
        .order_by(ProactiveInsight.created_at.desc())
        .limit(50)
    )
    all_rows = result.scalars().all()

    seen_task_titles: set[str] = set()
    deduped: list = []
    for i in all_rows:
        if i.insight_type == "task_completed":
            if i.title in seen_task_titles:
                continue
            seen_task_titles.add(i.title)
        deduped.append(i)

    insights = deduped[:20]
    unread = len(insights)
    return success(InsightsListOut(
        insights=[
            InsightOut(
                id=str(i.id),
                insight_type=i.insight_type,
                title=i.title,
                content=i.content,
                notebook_id=str(i.notebook_id) if i.notebook_id else None,
                is_read=i.is_read,
                created_at=i.created_at.isoformat(),
            )
            for i in insights
        ],
        unread_count=unread,
    ))


@router.post("/insights/{insight_id}/read", response_model=ApiResponse[dict])
async def mark_insight_read(insight_id: UUID, current_user: CurrentUser, db: DbDep):
    from app.models import ProactiveInsight

    result = await db.execute(
        select(ProactiveInsight).where(
            ProactiveInsight.id == insight_id,
            ProactiveInsight.user_id == current_user.id,
        )
    )
    insight = result.scalar_one_or_none()
    if insight:
        insight.is_read = True
        await db.flush()
    return success({"ok": True})


@router.post("/insights/read-all", response_model=ApiResponse[dict])
async def mark_all_insights_read(current_user: CurrentUser, db: DbDep):
    from sqlalchemy import update
    from app.models import ProactiveInsight

    await db.execute(
        update(ProactiveInsight)
        .where(
            ProactiveInsight.user_id == current_user.id,
            ProactiveInsight.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    await db.flush()
    return success({"ok": True})
