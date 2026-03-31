from __future__ import annotations

import ipaddress
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.providers.image_gen_provider import _download_remote_image, generate_image


class _FakeStreamResponse:
    def __init__(self, chunks: list[bytes], headers: dict[str, str] | None = None) -> None:
        self._chunks = chunks
        self.headers = headers or {}

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    def raise_for_status(self) -> None:
        return None

    async def aiter_bytes(self):
        for chunk in self._chunks:
            yield chunk

class _FakeAsyncClient:
    def __init__(self, *, post_payload: dict | None = None, stream_response: _FakeStreamResponse | None = None, **_kwargs) -> None:
        self._post_payload = post_payload
        self._stream_response = stream_response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, *_args, **_kwargs):
        response = MagicMock()
        response.raise_for_status.return_value = None
        response.json.return_value = self._post_payload
        return response

    def stream(self, *_args, **_kwargs):
        return self._stream_response


@pytest.mark.asyncio
async def test_generate_image_downloads_https_url_with_size_limit(monkeypatch) -> None:
    stream_response = _FakeStreamResponse([b"te", b"st"], headers={"Content-Length": "4"})
    clients = [
        _FakeAsyncClient(post_payload={"data": [{"url": "https://cdn.example.com/image.png"}]}),
        _FakeAsyncClient(stream_response=stream_response),
    ]
    monkeypatch.setattr("app.providers.image_gen_provider._ensure_public_hostname", AsyncMock())
    monkeypatch.setattr("app.providers.image_gen_provider.httpx.AsyncClient", lambda **kwargs: clients.pop(0))

    image = await generate_image("draw a cat", api_key="sk-test")

    assert image == b"test"


@pytest.mark.asyncio
async def test_download_remote_image_rejects_non_https_urls() -> None:
    with pytest.raises(ValueError, match="must use HTTPS"):
        await _download_remote_image("http://example.com/image.png")


@pytest.mark.asyncio
async def test_download_remote_image_rejects_large_payload(monkeypatch) -> None:
    stream_response = _FakeStreamResponse([], headers={"Content-Length": str(11 * 1024 * 1024)})
    monkeypatch.setattr("app.providers.image_gen_provider._ensure_public_hostname", AsyncMock())
    monkeypatch.setattr(
        "app.providers.image_gen_provider.httpx.AsyncClient",
        lambda **kwargs: _FakeAsyncClient(stream_response=stream_response),
    )

    with pytest.raises(ValueError, match="too large"):
        await _download_remote_image("https://cdn.example.com/image.png")


@pytest.mark.asyncio
async def test_download_remote_image_rejects_private_hosts(monkeypatch) -> None:
    monkeypatch.setattr(
        "app.providers.image_gen_provider._resolve_host_ips",
        AsyncMock(return_value={ipaddress.ip_address("127.0.0.1")}),
    )

    with pytest.raises(ValueError, match="non-public"):
        await _download_remote_image("https://cdn.example.com/image.png")
