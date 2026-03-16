import asyncio
import logging
import os
import uuid
from uuid import UUID

from fastapi import APIRouter, Query, UploadFile, status
from fastapi.responses import RedirectResponse, StreamingResponse
from sqlalchemy import func, select

from app.dependencies import CurrentUser, DbDep
from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models import Chunk, Notebook, Source
from app.schemas.response import ApiResponse, success
from .schemas import ChunkOut, RechunkRequest, SourceImportUrl, SourceOut, SourcePage, SourceUpdate, STRATEGY_PARAMS
from app.config import settings

logger = logging.getLogger(__name__)

_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".md": "text/markdown",
    ".txt": "text/plain",
}

def _guess_content_type(filename: str) -> str:
    ext = os.path.splitext(filename)[1].lower()
    return _CONTENT_TYPES.get(ext, "application/octet-stream")

router = APIRouter(tags=["sources"])


@router.post(
    "/notebooks/{notebook_id}/sources/upload",
    response_model=ApiResponse[SourceOut],
    status_code=status.HTTP_201_CREATED,
)
async def upload_source(
    notebook_id: UUID,
    file: UploadFile,
    db: DbDep,
    current_user: CurrentUser,
):
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("笔记本不存在")

    ext = os.path.splitext(file.filename or "")[1].lower()
    type_map = {".pdf": "pdf", ".md": "md", ".txt": "md"}
    source_type = type_map.get(ext, "md")

    file_id = str(uuid.uuid4())
    storage_key = f"notebooks/{notebook_id}/{file_id}{ext}"
    content_type = _guess_content_type(file.filename or "")

    content = await file.read()

    from app.providers.storage import storage as get_storage
    await get_storage().upload(storage_key, content, content_type)

    source = Source(
        notebook_id=notebook_id,
        title=file.filename,
        type=source_type,
        status="pending",
        storage_key=storage_key,
        storage_backend=settings.storage_backend,
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)

    from app.workers.tasks import ingest_source
    ingest_source.delay(str(source.id))

    return success(source)


@router.post(
    "/notebooks/{notebook_id}/sources/import-url",
    response_model=ApiResponse[SourceOut],
    status_code=status.HTTP_201_CREATED,
)
async def import_source_url(
    notebook_id: UUID,
    body: SourceImportUrl,
    db: DbDep,
    current_user: CurrentUser,
):
    result = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
    )
    if result.scalar_one_or_none() is None:
        raise NotFoundError("笔记本不存在")

    source = Source(
        notebook_id=notebook_id,
        title=body.title or body.url,
        type="web",
        status="pending",
        url=body.url,
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)

    from app.workers.tasks import ingest_source
    ingest_source.delay(str(source.id))

    return success(source)


@router.get("/sources/all", response_model=ApiResponse[SourcePage])
async def list_all_sources(
    db: DbDep,
    current_user: CurrentUser,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    type: str | None = Query(None),
    search: str | None = Query(None),
):
    """Paginated listing of ALL sources across all notebooks owned by the user."""
    base = (
        select(Source)
        .join(Notebook, Source.notebook_id == Notebook.id)
        .where(Notebook.user_id == current_user.id)
    )

    if type and type != "all":
        type_map = {"doc": ["md", "note", "doc"], "pdf": ["pdf"], "web": ["web"], "audio": ["audio"]}
        allowed = type_map.get(type, [type])
        base = base.where(Source.type.in_(allowed))

    if search:
        pattern = f"%{search}%"
        base = base.where(Source.title.ilike(pattern) | Source.summary.ilike(pattern))

    count_result = await db.execute(select(func.count()).select_from(base.subquery()))
    total = count_result.scalar() or 0

    result = await db.execute(
        base.order_by(Source.created_at.desc()).offset(offset).limit(limit)
    )
    items = result.scalars().all()

    return success(SourcePage(
        items=items,
        total=total,
        offset=offset,
        limit=limit,
        has_more=(offset + limit) < total,
    ))


@router.get("/notebooks/{notebook_id}/sources", response_model=ApiResponse[list[SourceOut]])
async def list_sources(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    result_nb = await db.execute(
        select(Notebook).where(Notebook.id == notebook_id, Notebook.user_id == current_user.id)
    )
    if result_nb.scalar_one_or_none() is None:
        raise NotFoundError("笔记本不存在")

    result = await db.execute(
        select(Source)
        .where(Source.notebook_id == notebook_id)
        .order_by(Source.created_at.desc())
    )
    return success(result.scalars().all())


@router.get("/sources/{source_id}/chunks", response_model=ApiResponse[list[ChunkOut]])
async def list_chunks(source_id: UUID, db: DbDep, current_user: CurrentUser):
    source = await _get_owned_source(db, source_id, current_user.id)
    result = await db.execute(
        select(Chunk)
        .where(Chunk.source_id == source.id)
        .order_by(Chunk.chunk_index.asc())
    )
    return success(result.scalars().all())


@router.patch("/sources/{source_id}", response_model=ApiResponse[SourceOut])
async def update_source(
    source_id: UUID,
    body: SourceUpdate,
    db: DbDep,
    current_user: CurrentUser,
):
    source = await _get_owned_source(db, source_id, current_user.id)
    if body.title is not None:
        source.title = body.title
    if body.notebook_id is not None:
        nb_result = await db.execute(
            select(Notebook).where(
                Notebook.id == body.notebook_id,
                Notebook.user_id == current_user.id,
            )
        )
        if nb_result.scalar_one_or_none() is None:
            raise NotFoundError("目标笔记本不存在")
        source.notebook_id = body.notebook_id
        await db.execute(
            Chunk.__table__.update()
            .where(Chunk.source_id == source.id)
            .values(notebook_id=body.notebook_id)
        )
    await db.flush()
    await db.refresh(source)
    return success(source)


@router.post("/sources/{source_id}/rechunk", status_code=status.HTTP_202_ACCEPTED)
async def rechunk_source(
    source_id: UUID,
    body: RechunkRequest,
    db: DbDep,
    current_user: CurrentUser,
):
    source = await _get_owned_source(db, source_id, current_user.id)
    if source.status == "processing":
        raise ConflictError("资源正在处理中，请稍后重试")

    default_size, default_overlap = STRATEGY_PARAMS.get(body.strategy, (512, 64))
    chunk_size = body.chunk_size or default_size
    chunk_overlap = body.chunk_overlap or default_overlap

    source.status = "pending"
    await db.flush()

    from app.workers.tasks import ingest_source
    ingest_source.apply_async(
        args=[str(source.id)],
        kwargs={"chunk_size": chunk_size, "chunk_overlap": chunk_overlap},
    )
    return success({"status": "queued", "chunk_size": chunk_size, "chunk_overlap": chunk_overlap})


@router.get("/sources/{source_id}/download")
async def download_source_file(source_id: UUID, db: DbDep, current_user: CurrentUser):
    """
    Download or preview the original file for a source.
    - Local backend: StreamingResponse (inline)
    - Cloud backends: 302 redirect to a pre-signed URL (TTL 1h)
    """
    source = await _get_owned_source(db, source_id, current_user.id)

    if not source.storage_key and not source.file_path:
        raise NotFoundError("该资源没有关联的文件")

    from app.providers.storage import storage as get_storage

    if source.storage_key:
        url = await get_storage().get_url(source.storage_key, expires_in=3600)

        if url.startswith("/api/"):
            try:
                content = await get_storage().download(source.storage_key)
            except FileNotFoundError:
                raise NotFoundError("文件未找到")
            filename = source.title or source.storage_key.split("/")[-1]
            media_type = _guess_content_type(filename)
            return StreamingResponse(
                iter([content]),
                media_type=media_type,
                headers={"Content-Disposition": f'inline; filename="{filename}"'},
            )

        return RedirectResponse(url=url, status_code=302)

    if source.file_path and os.path.exists(source.file_path):
        import aiofiles

        async def _iter():
            async with aiofiles.open(source.file_path, "rb") as f:
                while chunk := await f.read(65536):
                    yield chunk

        filename = source.title or os.path.basename(source.file_path)
        return StreamingResponse(
            _iter(),
            media_type=_guess_content_type(source.file_path),
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )

    raise NotFoundError("文件未找到")


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: UUID, db: DbDep, current_user: CurrentUser):
    source = await _get_owned_source(db, source_id, current_user.id)
    notebook_id = source.notebook_id

    from app.providers.storage import storage as get_storage
    if source.storage_key:
        try:
            await get_storage().delete(source.storage_key)
        except Exception as exc:
            logger.warning("Failed to delete storage file %s: %s", source.storage_key, exc)
    elif source.file_path and os.path.exists(source.file_path):
        try:
            os.unlink(source.file_path)
        except OSError as exc:
            logger.warning("Failed to delete legacy local file %s: %s", source.file_path, exc)

    await db.delete(source)
    await db.flush()
    asyncio.create_task(_refresh_summary_safe(notebook_id))


async def _refresh_summary_safe(notebook_id: UUID) -> None:
    """Refresh NotebookSummary with its own DB session after a source is deleted."""
    from app.agents.memory import refresh_notebook_summary
    from app.database import AsyncSessionLocal
    try:
        async with AsyncSessionLocal() as session:
            await refresh_notebook_summary(notebook_id, session)
            await session.commit()
    except Exception as exc:
        logger.warning("Failed to refresh notebook summary after source deletion: %s", exc)


async def _get_owned_source(db, source_id: UUID, user_id) -> Source:
    result = await db.execute(
        select(Source)
        .join(Notebook, Source.notebook_id == Notebook.id)
        .where(Source.id == source_id, Notebook.user_id == user_id)
    )
    source = result.scalar_one_or_none()
    if source is None:
        raise NotFoundError("资源不存在")
    return source


# ---------------------------------------------------------------------------
# Global (unbound) sources — knowledge base page
# ---------------------------------------------------------------------------

async def _get_or_create_global_notebook(db, user_id) -> Notebook:
    """Return the user's is_global notebook, creating it on demand."""
    result = await db.execute(
        select(Notebook).where(Notebook.user_id == user_id, Notebook.is_global.is_(True))
    )
    nb = result.scalar_one_or_none()
    if nb is None:
        nb = Notebook(
            user_id=user_id,
            title="全局知识库",
            description="全局来源，不绑定具体笔记本。",
            is_global=True,
            is_system=False,
            status="active",
        )
        db.add(nb)
        await db.flush()
        await db.refresh(nb)
    return nb


@router.get("/sources/global", response_model=ApiResponse[list[SourceOut]])
async def list_global_sources(db: DbDep, current_user: CurrentUser):
    """Return all sources in the user's hidden global notebook."""
    nb = await _get_or_create_global_notebook(db, current_user.id)
    result = await db.execute(
        select(Source)
        .where(Source.notebook_id == nb.id)
        .order_by(Source.created_at.desc())
    )
    return success(result.scalars().all())


@router.post(
    "/sources/global/upload",
    response_model=ApiResponse[SourceOut],
    status_code=status.HTTP_201_CREATED,
)
async def upload_global_source(
    file: UploadFile,
    db: DbDep,
    current_user: CurrentUser,
):
    """Upload a file to the user's global (unbound) knowledge base."""
    nb = await _get_or_create_global_notebook(db, current_user.id)

    ext = os.path.splitext(file.filename or "")[1].lower()
    type_map = {".pdf": "pdf", ".md": "md", ".txt": "md"}
    source_type = type_map.get(ext, "md")

    file_id = str(uuid.uuid4())
    storage_key = f"global/{nb.id}/{file_id}{ext}"
    content_type = _guess_content_type(file.filename or "")
    content = await file.read()

    from app.providers.storage import storage as get_storage
    await get_storage().upload(storage_key, content, content_type)

    source = Source(
        notebook_id=nb.id,
        title=file.filename,
        type=source_type,
        status="pending",
        storage_key=storage_key,
        storage_backend=settings.storage_backend,
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)

    from app.workers.tasks import ingest_source
    ingest_source.delay(str(source.id))

    return success(source)


@router.post(
    "/sources/global/import-url",
    response_model=ApiResponse[SourceOut],
    status_code=status.HTTP_201_CREATED,
)
async def import_global_source_url(
    body: SourceImportUrl,
    db: DbDep,
    current_user: CurrentUser,
):
    """Import a URL into the user's global (unbound) knowledge base."""
    nb = await _get_or_create_global_notebook(db, current_user.id)

    source = Source(
        notebook_id=nb.id,
        title=body.title or body.url,
        type="web",
        status="pending",
        url=body.url,
    )
    db.add(source)
    await db.flush()
    await db.refresh(source)

    from app.workers.tasks import ingest_source
    ingest_source.delay(str(source.id))

    return success(source)
