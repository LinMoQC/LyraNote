"""
Upload service — temp attachment storage helpers.
"""

from __future__ import annotations

import mimetypes
import uuid

from fastapi import HTTPException, UploadFile
from fastapi.responses import Response

from app.providers.storage import storage

MAX_UPLOAD_SIZE = 20 * 1024 * 1024  # 20 MB
IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")


class UploadService:
    async def upload_temp_file(
        self,
        file: UploadFile,
        user_id: str,
    ) -> dict[str, str | int]:
        content = await file.read()
        if len(content) > MAX_UPLOAD_SIZE:
            raise HTTPException(status_code=413, detail="文件大小不能超过 20 MB")

        ext = ""
        if file.filename:
            ext = "." + file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""

        file_id = str(uuid.uuid4())
        content_type = (
            file.content_type
            or mimetypes.guess_type(file.filename or "")[0]
            or "application/octet-stream"
        )
        storage_key = f"temp/{user_id}/{file_id}{ext}"

        await storage().upload(storage_key, content, content_type)

        return {
            "id": file_id,
            "storage_key": storage_key,
            "filename": file.filename or f"{file_id}{ext}",
            "content_type": content_type,
            "size": len(content),
        }

    async def get_temp_file(self, file_id: str, user_id: str) -> Response:
        store = storage()
        for ext in ("", ".pdf", ".txt", ".md", ".doc", ".docx", *IMAGE_EXTS):
            key = f"temp/{user_id}/{file_id}{ext}"
            try:
                if not await store.exists(key):
                    continue
                data = await store.download(key)
                content_type = (
                    mimetypes.guess_type(f"f{ext}")[0] or "application/octet-stream"
                )
                return Response(content=data, media_type=content_type)
            except FileNotFoundError:
                continue
        raise HTTPException(status_code=404, detail="File not found")
