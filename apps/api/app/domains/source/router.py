from uuid import UUID

from fastapi import APIRouter, Query, UploadFile, status
from fastapi.responses import RedirectResponse, StreamingResponse

from app.dependencies import CurrentUser, DbDep
from app.schemas.response import ApiResponse, success
from app.services.source_service import DownloadRedirect, SourceService
from .schemas import (
    ChunkOut,
    RechunkRequest,
    SourceImportPath,
    SourceImportUrl,
    SourceOut,
    SourcePage,
    SourceUpdate,
)

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
    content = await file.read()
    svc = SourceService(db, current_user.id)
    source = await svc.upload_source(notebook_id, file.filename, content)
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
    svc = SourceService(db, current_user.id)
    source = await svc.import_source_url(notebook_id, body.url, body.title)
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
    svc = SourceService(db, current_user.id)
    items, total = await svc.list_all_sources(offset=offset, limit=limit, type_filter=type, search=search)
    return success(SourcePage(items=items, total=total, offset=offset, limit=limit, has_more=(offset + limit) < total))

@router.get("/notebooks/{notebook_id}/sources", response_model=ApiResponse[list[SourceOut]])
async def list_sources(notebook_id: UUID, db: DbDep, current_user: CurrentUser):
    svc = SourceService(db, current_user.id)
    items = await svc.list_sources(notebook_id)
    return success(items)

@router.get("/sources/{source_id}/chunks", response_model=ApiResponse[list[ChunkOut]])
async def list_chunks(source_id: UUID, db: DbDep, current_user: CurrentUser):
    svc = SourceService(db, current_user.id)
    chunks = await svc.list_chunks(source_id)
    return success(chunks)

@router.patch("/sources/{source_id}", response_model=ApiResponse[SourceOut])
async def update_source(
    source_id: UUID,
    body: SourceUpdate,
    db: DbDep,
    current_user: CurrentUser,
):
    svc = SourceService(db, current_user.id)
    source = await svc.update_source(
        source_id, title=body.title, notebook_id=body.notebook_id
    )
    return success(source)

@router.post("/sources/{source_id}/rechunk", status_code=status.HTTP_202_ACCEPTED)
async def rechunk_source(
    source_id: UUID,
    body: RechunkRequest,
    db: DbDep,
    current_user: CurrentUser,
):
    svc = SourceService(db, current_user.id)
    chunk_size, chunk_overlap = await svc.rechunk_source(
        source_id,
        strategy=body.strategy,
        chunk_size=body.chunk_size,
        chunk_overlap=body.chunk_overlap,
        splitter_type=body.splitter_type,
        separators=body.separators,
        min_chunk_size=body.min_chunk_size,
    )
    return success({"status": "queued", "chunk_size": chunk_size, "chunk_overlap": chunk_overlap})

@router.get("/sources/{source_id}/download")
async def download_source_file(source_id: UUID, db: DbDep, current_user: CurrentUser):
    svc = SourceService(db, current_user.id)
    result = await svc.get_download(source_id)

    if isinstance(result, DownloadRedirect):
        return RedirectResponse(url=result.url, status_code=302)

    headers = {"Content-Disposition": f'inline; filename="{result.filename}"'}
    return StreamingResponse(
        result.chunks,
        media_type=result.media_type,
        headers=headers,
    )

@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: UUID, db: DbDep, current_user: CurrentUser):
    svc = SourceService(db, current_user.id)
    await svc.delete_source(source_id)

# --- Global (unbound) sources ---

@router.get("/sources/global", response_model=ApiResponse[list[SourceOut]])
async def list_global_sources(db: DbDep, current_user: CurrentUser):
    svc = SourceService(db, current_user.id)
    items = await svc.list_global_sources()
    return success(items)

@router.post(
    "/sources/global/upload",
    response_model=ApiResponse[SourceOut],
    status_code=status.HTTP_201_CREATED,
)
async def upload_global_source(file: UploadFile, db: DbDep, current_user: CurrentUser):
    content = await file.read()
    svc = SourceService(db, current_user.id)
    source = await svc.upload_global_source(file.filename, content)
    return success(source)

@router.post(
    "/sources/global/import-url",
    response_model=ApiResponse[SourceOut],
    status_code=status.HTTP_201_CREATED,
)
async def import_global_source_url(
    body: SourceImportUrl, db: DbDep, current_user: CurrentUser
):
    svc = SourceService(db, current_user.id)
    source = await svc.import_global_source_url(body.url, body.title)
    return success(source)


@router.post(
    "/sources/global/import-path",
    response_model=ApiResponse[SourceOut],
    status_code=status.HTTP_201_CREATED,
)
async def import_global_source_path(
    body: SourceImportPath,
    db: DbDep,
    current_user: CurrentUser,
):
    svc = SourceService(db, current_user.id)
    source = await svc.import_global_source_path(body.path, sha256=body.sha256)
    return success(source)
