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

import base64
import logging

import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)
_DEFAULT_BASE_URL = "https://api.siliconflow.cn/v1"
_DEFAULT_MODEL = "black-forest-labs/FLUX.1-schnell"


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
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            img_resp = await client.get(url)
            img_resp.raise_for_status()
            return img_resp.content

    if b64:
        return base64.b64decode(b64)

    raise ValueError(f"Image generation API returned unrecognised image format: {first}")
