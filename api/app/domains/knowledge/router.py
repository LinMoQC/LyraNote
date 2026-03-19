"""
Writing Agent API endpoints — inline AI actions for the editor.
Also exposes a job status endpoint for frontend polling.
"""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.models import AgentRun, Note, Notebook
from app.schemas.response import ApiResponse, success

from .schemas import JobStatusOut, RewriteRequest, RewriteResponse, SuggestRequest, SuggestResponse

router = APIRouter(tags=["ai"])


# ---------------------------------------------------------------------------
# Ghost Text suggestion
# ---------------------------------------------------------------------------

@router.post("/ai/suggest", response_model=ApiResponse[SuggestResponse])
async def suggest(body: SuggestRequest, current_user: CurrentUser, db: DbDep):
    from app.agents.writing.ghost_text import suggest_continuation

    suggestion = await suggest_continuation(body.note_context, body.cursor_text)
    return success(SuggestResponse(suggestion=suggestion))


# ---------------------------------------------------------------------------
# Selection rewrite
# ---------------------------------------------------------------------------

@router.post("/ai/rewrite", response_model=ApiResponse[RewriteResponse])
async def rewrite(body: RewriteRequest, current_user: CurrentUser, db: DbDep):
    from app.agents.writing.ghost_text import rewrite_selection

    result = await rewrite_selection(body.selected_text, body.action, body.note_context)
    return success(RewriteResponse(result=result))


# ---------------------------------------------------------------------------
# Job status polling
# ---------------------------------------------------------------------------

@router.get("/jobs/{job_id}", response_model=ApiResponse[JobStatusOut])
async def get_job_status(job_id: UUID, db: DbDep, current_user: CurrentUser):
    result = await db.execute(select(AgentRun).where(AgentRun.id == job_id))
    job = result.scalar_one_or_none()
    if job is None:
        raise NotFoundError("任务不存在")
    return success(job)
