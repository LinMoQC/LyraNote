from __future__ import annotations

from fastapi import APIRouter, Query, status

from app.dependencies import CurrentUser, DbDep
from app.schemas.response import ApiResponse, success
from app.services.desktop_chat_service import DesktopChatService
from app.services.desktop_knowledge_service import DesktopKnowledgeService
from app.services.desktop_service import DesktopService

from .schemas import (
    CancelJobResult,
    CreateWatchFolderRequest,
    DeleteWatchFolderRequest,
    DesktopJobListOut,
    DesktopRuntimeOut,
    InspectLocalFileRequest,
    InspectLocalFileResult,
    ImportWatchFolderRequest,
    ImportWatchFolderResult,
    RecentImportListOut,
    LocalAnswerOut,
    LocalAnswerRequest,
    LocalSearchOut,
    WatchFolderListOut,
    WatchFolderOut,
)

router = APIRouter(tags=["desktop"])
service = DesktopService()


@router.get("/desktop/runtime", response_model=ApiResponse[DesktopRuntimeOut])
async def get_desktop_runtime():
    return success(DesktopRuntimeOut(**service.get_runtime_status()))


@router.get("/jobs", response_model=ApiResponse[DesktopJobListOut])
async def list_jobs(current_user: CurrentUser):
    return success(DesktopJobListOut(**service.list_jobs(user_id=str(current_user.id))))


@router.post("/jobs/{job_id}/cancel", response_model=ApiResponse[CancelJobResult], status_code=status.HTTP_200_OK)
async def cancel_job(job_id: str, current_user: CurrentUser):
    return success(CancelJobResult(**service.cancel_job(user_id=str(current_user.id), job_id=job_id)))


@router.get("/watch-folders", response_model=ApiResponse[WatchFolderListOut])
async def list_watch_folders(current_user: CurrentUser):
    return success(WatchFolderListOut(**service.list_watch_folders(user_id=str(current_user.id))))


@router.get("/recent-imports", response_model=ApiResponse[RecentImportListOut])
async def list_recent_imports(current_user: CurrentUser):
    return success(RecentImportListOut(**service.list_recent_imports(user_id=str(current_user.id))))


@router.post("/local-files/inspect", response_model=ApiResponse[InspectLocalFileResult], status_code=status.HTTP_200_OK)
async def inspect_local_file(body: InspectLocalFileRequest, current_user: CurrentUser):
    return success(
        InspectLocalFileResult(
            **service.inspect_local_file(
                user_id=str(current_user.id),
                path=body.path,
                sha256=body.sha256,
            )
        )
    )


@router.get("/search/local", response_model=ApiResponse[LocalSearchOut])
async def search_local(
    db: DbDep,
    current_user: CurrentUser,
    q: str = Query(..., min_length=1),
    notebook_id: str | None = Query(None),
    source_id: str | None = Query(None),
    limit: int = Query(5, ge=1, le=20),
):
    service = DesktopKnowledgeService(db, current_user.id)
    return success(
        LocalSearchOut(
            **await service.search_local(
                query=q,
                notebook_id=notebook_id,
                source_id=source_id,
                limit=limit,
            )
        )
    )


@router.post(
    "/desktop/chat/local-answer",
    response_model=ApiResponse[LocalAnswerOut],
    status_code=status.HTTP_200_OK,
)
async def answer_locally(
    body: LocalAnswerRequest,
    db: DbDep,
    current_user: CurrentUser,
):
    service = DesktopChatService(db, current_user.id)
    return success(
        LocalAnswerOut(
            **await service.answer_locally(
                query=body.query,
                notebook_id=body.notebook_id,
                source_id=body.source_id,
                limit=body.limit,
            )
        )
    )


@router.post("/watch-folders", response_model=ApiResponse[WatchFolderOut], status_code=status.HTTP_201_CREATED)
async def create_watch_folder(body: CreateWatchFolderRequest, current_user: CurrentUser):
    return success(WatchFolderOut(**service.create_watch_folder(user_id=str(current_user.id), path=body.path)))


@router.delete("/watch-folders", status_code=status.HTTP_204_NO_CONTENT)
async def delete_watch_folder(body: DeleteWatchFolderRequest, current_user: CurrentUser):
    service.delete_watch_folder(user_id=str(current_user.id), folder_id=body.id)


@router.post("/watch-folders/import", response_model=ApiResponse[ImportWatchFolderResult], status_code=status.HTTP_200_OK)
async def import_watch_folder_path(body: ImportWatchFolderRequest, current_user: CurrentUser):
    return success(
        ImportWatchFolderResult(
            **await service.import_watch_folder_path(
                user_id=str(current_user.id),
                path=body.path,
            )
        )
    )
