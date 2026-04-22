from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.responses import Response

from app.domains.upload.router import get_temp_file, upload_temp_file


@pytest.mark.asyncio
async def test_upload_temp_file_delegates_to_service(monkeypatch) -> None:
    service_call = AsyncMock(
        return_value={
            "id": "file-1",
            "storage_key": "temp/user/file-1.txt",
            "filename": "demo.txt",
            "content_type": "text/plain",
            "size": 4,
        }
    )
    monkeypatch.setattr(
        "app.domains.upload.router.UploadService.upload_temp_file",
        service_call,
    )

    file = SimpleNamespace()
    current_user = SimpleNamespace(id=uuid4())

    response = await upload_temp_file(file=file, current_user=current_user)

    assert response.code == 0
    assert response.data is not None
    assert response.data["id"] == "file-1"
    service_call.assert_awaited_once_with(file, str(current_user.id))


@pytest.mark.asyncio
async def test_get_temp_file_delegates_to_service(monkeypatch) -> None:
    service_call = AsyncMock(return_value=Response(content=b"demo", media_type="text/plain"))
    monkeypatch.setattr(
        "app.domains.upload.router.UploadService.get_temp_file",
        service_call,
    )

    current_user = SimpleNamespace(id=uuid4())
    response = await get_temp_file(file_id="file-1", current_user=current_user)

    assert response.status_code == 200
    assert response.body == b"demo"
    service_call.assert_awaited_once_with("file-1", str(current_user.id))
