from uuid import UUID

from fastapi import APIRouter, status
from sqlalchemy import select

from app.dependencies import CurrentUser, DbDep
from app.exceptions import NotFoundError
from app.models import Artifact, Notebook
from app.schemas.response import ApiResponse, success
from .schemas import ArtifactGenerateRequest, ArtifactOut

ARTIFACT_TITLES = {
    "summary": "摘要",
    "faq": "FAQ",
    "study_guide": "学习提纲",
    "briefing": "简报",
}

router = APIRouter(tags=["artifacts"])


@router.get("/notebooks/{notebook_id}/artifacts", response_model=ApiResponse[list[ArtifactOut]])
async def list_artifacts(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    await _assert_owner(db, notebook_id, current_user.id)
    result = await db.execute(
        select(Artifact)
        .where(Artifact.notebook_id == notebook_id)
        .order_by(Artifact.created_at.desc())
    )
    return success(result.scalars().all())


@router.get("/artifacts/{artifact_id}", response_model=ApiResponse[ArtifactOut])
async def get_artifact(artifact_id: UUID, db: DbDep, current_user: CurrentUser):
    return success(await _get_owned_artifact(db, artifact_id, current_user.id))


@router.post(
    "/notebooks/{notebook_id}/artifacts/generate",
    response_model=ApiResponse[ArtifactOut],
    status_code=status.HTTP_201_CREATED,
)
async def generate_artifact(
    notebook_id: UUID,
    body: ArtifactGenerateRequest,
    db: DbDep,
    current_user: CurrentUser,
):
    await _assert_owner(db, notebook_id, current_user.id)

    artifact = Artifact(
        notebook_id=notebook_id,
        type=body.type,
        title=ARTIFACT_TITLES.get(body.type, body.type),
        status="generating",
    )
    db.add(artifact)
    await db.flush()
    await db.refresh(artifact)

    from app.workers.tasks import generate_artifact_task
    generate_artifact_task.delay(str(artifact.id))

    return success(artifact)


async def _assert_owner(db, notebook_id: UUID, user_id):
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == user_id)
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("笔记本不存在")


async def _get_owned_artifact(db, artifact_id: UUID, user_id) -> Artifact:
    result = await db.execute(
        select(Artifact)
        .join(Notebook, Artifact.notebook_id == Notebook.id)
        .where(Artifact.id == artifact_id, Notebook.user_id == user_id)
    )
    artifact = result.scalar_one_or_none()
    if artifact is None:
        raise NotFoundError("生成内容不存在")
    return artifact
