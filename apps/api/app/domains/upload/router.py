"""
Temporary file upload endpoint for chat attachments.

Files are stored under `temp/{user_id}/{uuid}{ext}` and intended for
short-lived use (attached to the next message). The agent reads them
back when processing a message with `attachment_ids`.
"""

import mimetypes
import uuid

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import Response

from app.dependencies import CurrentUser, DbDep
from app.providers.storage import storage
from app.schemas.response import success

router = APIRouter(tags=["uploads"])

MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB

_IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")


@router.post("/uploads/temp")
async def upload_temp_file(
    file: UploadFile,
    current_user: CurrentUser,
    db: DbDep,
):
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="文件大小不能超过 20 MB")

    ext = ""
    if file.filename:
        ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

    file_id = str(uuid.uuid4())
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    storage_key = f"temp/{current_user.id}/{file_id}{ext}"

    await storage().upload(storage_key, content, content_type)

    return success({
        "id": file_id,
        "storage_key": storage_key,
        "filename": file.filename or f"{file_id}{ext}",
        "content_type": content_type,
        "size": len(content),
    })


@router.get("/uploads/temp/{file_id}")
async def get_temp_file(
    file_id: str,
    current_user: CurrentUser,
):
    """Serve a temp-uploaded file back to the uploader (for image preview)."""
    store = storage()
    for ext in ("", ".pdf", ".txt", ".md", ".doc", ".docx", *_IMAGE_EXTS):
        key = f"temp/{current_user.id}/{file_id}{ext}"
        try:
            if not await store.exists(key):
                continue
            data = await store.download(key)
            ct = mimetypes.guess_type(f"f{ext}")[0] or "application/octet-stream"
            return Response(content=data, media_type=ct)
        except FileNotFoundError:
            continue
    raise HTTPException(status_code=404, detail="File not found")
