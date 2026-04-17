from __future__ import annotations

from fastapi import APIRouter, status

from app.dependencies import CurrentUser
from app.schemas.response import ApiResponse, success
from app.services.desktop_service import DesktopService

from .schemas import (
    CancelJobResult,
    CreateWatchFolderRequest,
    DeleteWatchFolderRequest,
    DesktopJobListOut,
    DesktopRuntimeOut,
    WatchFolderListOut,
    WatchFolderOut,
)

router = APIRouter(tags=["desktop"])
service = DesktopService()


@router.get("/desktop/runtime", response_model=ApiResponse[DesktopRuntimeOut])
async def get_desktop_runtime():
    return success(DesktopRuntimeOut(**service.get_runtime_status()))


@router.get("/jobs", response_model=ApiResponse[DesktopJobListOut])
async def list_jobs(_current_user: CurrentUser):
    return success(DesktopJobListOut(**service.list_jobs()))


@router.post("/jobs/{job_id}/cancel", response_model=ApiResponse[CancelJobResult], status_code=status.HTTP_200_OK)
async def cancel_job(job_id: str, _current_user: CurrentUser):
    return success(CancelJobResult(**service.cancel_job(job_id)))


@router.get("/watch-folders", response_model=ApiResponse[WatchFolderListOut])
async def list_watch_folders(current_user: CurrentUser):
    return success(WatchFolderListOut(**service.list_watch_folders(user_id=str(current_user.id))))


@router.post("/watch-folders", response_model=ApiResponse[WatchFolderOut], status_code=status.HTTP_201_CREATED)
async def create_watch_folder(body: CreateWatchFolderRequest, current_user: CurrentUser):
    return success(WatchFolderOut(**service.create_watch_folder(user_id=str(current_user.id), path=body.path)))


@router.delete("/watch-folders", status_code=status.HTTP_204_NO_CONTENT)
async def delete_watch_folder(body: DeleteWatchFolderRequest, current_user: CurrentUser):
    service.delete_watch_folder(user_id=str(current_user.id), folder_id=body.id)
