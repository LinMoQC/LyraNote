"""
Temporary file upload endpoint for chat attachments.

Files are stored under `temp/{user_id}/{uuid}{ext}` and intended for
short-lived use (attached to the next message). The agent reads them
back when processing a message with `attachment_ids`.
"""

from fastapi import APIRouter, UploadFile

from app.dependencies import CurrentUser
from app.schemas.response import success
from app.services.upload_service import UploadService

router = APIRouter(tags=["uploads"])


@router.post("/uploads/temp")
async def upload_temp_file(
    file: UploadFile,
    current_user: CurrentUser,
):
    payload = await UploadService().upload_temp_file(file, str(current_user.id))
    return success(payload)


@router.get("/uploads/temp/{file_id}")
async def get_temp_file(
    file_id: str,
    current_user: CurrentUser,
):
    """Serve a temp-uploaded file back to the uploader (for image preview)."""
    return await UploadService().get_temp_file(file_id, str(current_user.id))
