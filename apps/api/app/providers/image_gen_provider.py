"""
Image generation provider — SiliconFlow compatible.

Used exclusively to generate AI avatar portraits for the public home page.
The API is OpenAI Images-compatible (POST /v1/images/generations).

Supports SiliconFlow (https://siliconflow.cn) out of the box.  Any other
OpenAI Images-compatible endpoint can be configured via ``base_url``.

Response format accepted:
  {"images": [{"url": "https://..."}]}          — SiliconFlow style
  {"data": [{"url": "https://..."}]}            — OpenAI DALL-E style
  {"data": [{"b64_json": "<base64>"}]}          — OpenAI base64 style

Leave ``image_gen_api_key`` empty in config to disable avatar generation
entirely; the frontend will fall back to a DiceBear SVG in that case.
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)
_DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1"
_DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell"
_MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024
_ALLOWED_REMOTE_IMAGE_SCHEMES = {"https"}
_BLOCKED_REMOTE_HOSTNAMES = {"localhost", "127.0.0.1", "::1"}


async def generate_image(
    prompt: str,
    *,
    api_key: str,
    base_url: str = _DEFAULT_BASE_URL,
    model: str = _DEFAULT_MODEL,
    image_size: str = "512x512",
    num_inference_steps: int = 20,
) -> bytes:
    """Call the image generation API and return raw image bytes (JPEG/WebP/PNG).

    Raises ``httpx.HTTPStatusError`` on API errors,
    ``ValueError`` if the response contains no image data.
    """
    endpoint = f"{base_url.rstrip('/')}/images/generations"

    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "prompt": prompt,
                "image_size": image_size,
                "num_inference_steps": num_inference_steps,
            },
        )
        resp.raise_for_status()
        payload = resp.json()

    # ── Extract image from response ──────────────────────────────────────────
    # SiliconFlow: {"images": [{"url": "..."}]}
    # OpenAI DALL-E: {"data": [{"url": "..."}]} or {"data": [{"b64_json": "..."}]}
    images: list[dict] = payload.get("images") or payload.get("data") or []
    if not images:
        raise ValueError(f"Image generation API returned no images: {payload}")

    first = images[0]
    url: str | None = first.get("url")
    b64: str | None = first.get("b64_json")

    if url:
        return await _download_remote_image(url)

    if b64:
        return base64.b64decode(b64)

    raise ValueError(f"Image generation API returned unrecognised image format: {first}")


async def _download_remote_image(url: str) -> bytes:
    parsed = urlparse(url)
    if parsed.scheme.lower() not in _ALLOWED_REMOTE_IMAGE_SCHEMES:
        raise ValueError("Remote image URL must use HTTPS.")
    if not parsed.hostname:
        raise ValueError("Remote image URL must include a hostname.")

    await _ensure_public_hostname(parsed.hostname)

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=False) as client:
        async with client.stream("GET", url, headers={"Accept": "image/*"}) as img_resp:
            img_resp.raise_for_status()
            declared_length = int(img_resp.headers.get("Content-Length", "0") or "0")
            if declared_length and declared_length > _MAX_REMOTE_IMAGE_BYTES:
                raise ValueError("Remote image is too large to download safely.")

            payload = bytearray()
            async for chunk in img_resp.aiter_bytes():
                payload.extend(chunk)
                if len(payload) > _MAX_REMOTE_IMAGE_BYTES:
                    raise ValueError("Remote image exceeded the download size limit.")
            return bytes(payload)


async def _ensure_public_hostname(hostname: str) -> None:
    normalized = hostname.strip().lower()
    if normalized in _BLOCKED_REMOTE_HOSTNAMES or normalized.endswith(".local"):
        raise ValueError("Remote image host is not allowed.")

    for addr in await _resolve_host_ips(normalized):
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_reserved
            or addr.is_multicast
            or addr.is_unspecified
        ):
            raise ValueError("Remote image host resolved to a non-public IP address.")


async def _resolve_host_ips(hostname: str) -> set[ipaddress.IPv4Address | ipaddress.IPv6Address]:
    records = await asyncio.to_thread(socket.getaddrinfo, hostname, None, type=socket.SOCK_STREAM)
    addresses: set[ipaddress.IPv4Address | ipaddress.IPv6Address] = set()
    for *_, sockaddr in records:
        host = sockaddr[0]
        addresses.add(ipaddress.ip_address(host))
    return addresses
