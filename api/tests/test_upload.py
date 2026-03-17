"""
Tests for the /api/v1/uploads/temp endpoint.
"""
from __future__ import annotations

import io


class TestUploadTempFile:
    async def test_upload_image_success(self, client, auth_headers):
        file_content = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100  # minimal PNG-like bytes
        resp = await client.post(
            "/api/v1/uploads/temp",
            headers=auth_headers,
            files={"file": ("test.png", io.BytesIO(file_content), "image/png")},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert "id" in data
        assert data["filename"] == "test.png"
        assert data["content_type"] == "image/png"
        assert data["size"] == len(file_content)
        assert data["storage_key"].endswith(".png")

    async def test_upload_text_file(self, client, auth_headers):
        content = b"Hello, LyraNote!"
        resp = await client.post(
            "/api/v1/uploads/temp",
            headers=auth_headers,
            files={"file": ("notes.txt", io.BytesIO(content), "text/plain")},
        )
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["content_type"] == "text/plain"
        assert data["size"] == len(content)

    async def test_upload_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/uploads/temp",
            files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert resp.status_code == 401

    async def test_upload_rejects_oversized_file(self, client, auth_headers):
        """Files over 20 MB should be rejected with 413."""
        big_content = b"x" * (20 * 1024 * 1024 + 1)
        resp = await client.post(
            "/api/v1/uploads/temp",
            headers=auth_headers,
            files={"file": ("big.bin", io.BytesIO(big_content), "application/octet-stream")},
        )
        assert resp.status_code == 413

    async def test_upload_storage_key_includes_user_id(self, client, test_user, auth_headers):
        user, _ = test_user
        resp = await client.post(
            "/api/v1/uploads/temp",
            headers=auth_headers,
            files={"file": ("doc.pdf", io.BytesIO(b"%PDF-1.4"), "application/pdf")},
        )
        assert resp.status_code == 200
        storage_key = resp.json()["data"]["storage_key"]
        assert str(user.id) in storage_key
        assert storage_key.startswith("temp/")


class TestGetTempFile:
    async def test_get_uploaded_file(self, client, auth_headers):
        content = b"file content here"
        upload_resp = await client.post(
            "/api/v1/uploads/temp",
            headers=auth_headers,
            files={"file": ("hello.txt", io.BytesIO(content), "text/plain")},
        )
        file_id = upload_resp.json()["data"]["id"]

        get_resp = await client.get(
            f"/api/v1/uploads/temp/{file_id}",
            headers=auth_headers,
        )
        assert get_resp.status_code == 200
        assert get_resp.content == content

    async def test_get_nonexistent_file_returns_404(self, client, auth_headers):
        resp = await client.get(
            "/api/v1/uploads/temp/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert resp.status_code == 404
