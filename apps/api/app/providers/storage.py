"""
StorageProvider abstraction layer.

Supported backends (configured via STORAGE_BACKEND env var):
  local  — local filesystem, async I/O via aiofiles
  s3     — AWS S3 via aioboto3
  minio  — self-hosted MinIO (S3-compatible, custom endpoint_url)
  oss    — Aliyun OSS (S3-compatible, custom endpoint_url)
  r2     — Cloudflare R2 (S3-compatible, custom endpoint_url)

All S3-compatible backends share the same S3Storage implementation;
only the endpoint_url differs.

Usage:
    from app.providers.storage import storage
    await storage().upload("notebooks/nb_id/uuid.pdf", content, "application/pdf")
    data = await storage().download("notebooks/nb_id/uuid.pdf")
    url  = await storage().get_url("notebooks/nb_id/uuid.pdf", expires_in=3600)
    await storage().delete("notebooks/nb_id/uuid.pdf")
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from contextlib import asynccontextmanager
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class StorageProvider(ABC):

    @abstractmethod
    async def upload(
        self,
        key: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> None:
        """Upload bytes to the given storage key."""

    @abstractmethod
    async def download(self, key: str) -> bytes:
        """Download and return the file content as bytes.
        Raises FileNotFoundError if the key does not exist."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete the file at key. Silently ignores missing keys."""

    @abstractmethod
    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        """
        Return a URL to access the file.
        - Local backend: returns internal API path /api/v1/storage/files/<key>
        - Cloud backends: returns a pre-signed temporary URL
        """

    @abstractmethod
    async def exists(self, key: str) -> bool:
        """Return True if the key exists in storage."""


# ---------------------------------------------------------------------------
# Local filesystem backend
# ---------------------------------------------------------------------------

class LocalStorage(StorageProvider):
    """
    Stores files on the local filesystem under base_path.
    Uses aiofiles for non-blocking async I/O.
    """

    def __init__(self, base_path: str) -> None:
        self.base_path = Path(base_path).resolve()

    def _full_path(self, key: str) -> Path:
        resolved = (self.base_path / key).resolve()
        # Guard against directory traversal
        if not str(resolved).startswith(str(self.base_path)):
            raise ValueError(f"Invalid storage key (traversal detected): {key}")
        return resolved

    async def upload(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> None:
        import aiofiles
        path = self._full_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        async with aiofiles.open(path, "wb") as f:
            await f.write(content)
        logger.debug("LocalStorage.upload: %s (%d bytes)", key, len(content))

    async def download(self, key: str) -> bytes:
        import aiofiles
        path = self._full_path(key)
        if not path.exists():
            raise FileNotFoundError(f"Storage key not found: {key}")
        async with aiofiles.open(path, "rb") as f:
            data = await f.read()
        logger.debug("LocalStorage.download: %s (%d bytes)", key, len(data))
        return data

    async def delete(self, key: str) -> None:
        path = self._full_path(key)
        if path.exists():
            path.unlink()
            logger.debug("LocalStorage.delete: %s", key)

    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        # Returns an internal FastAPI route; the router handles auth + streaming
        return f"/api/v1/storage/files/{key}"

    async def exists(self, key: str) -> bool:
        return self._full_path(key).exists()


# ---------------------------------------------------------------------------
# S3-compatible backend (AWS S3 / MinIO / Aliyun OSS / Cloudflare R2)
# ---------------------------------------------------------------------------

class S3Storage(StorageProvider):
    """
    Async S3-compatible object storage via aioboto3.

    All four cloud backends (AWS S3, MinIO, Aliyun OSS, Cloudflare R2) share
    this implementation — only endpoint_url differs:
      AWS S3         — endpoint_url=None (uses boto3 default)
      MinIO          — endpoint_url=http://localhost:9000
      Aliyun OSS     — endpoint_url=https://oss-cn-hangzhou.aliyuncs.com
      Cloudflare R2  — endpoint_url=https://<account>.r2.cloudflarestorage.com
    """

    def __init__(
        self,
        bucket: str,
        access_key: str,
        secret_key: str,
        region: str = "us-east-1",
        endpoint_url: str | None = None,
        public_url: str | None = None,
    ) -> None:
        self.bucket = bucket
        self._public_url = public_url or endpoint_url
        self._client_kwargs: dict = {
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "region_name": region,
        }
        if endpoint_url:
            self._client_kwargs["endpoint_url"] = endpoint_url

    @asynccontextmanager
    async def _client(self):
        import aioboto3
        from botocore.config import Config
        session = aioboto3.Session()
        # Force path-style addressing + SigV4 for MinIO / self-hosted S3-compatible services.
        # Virtual-hosted style (the boto3 default) causes SignatureDoesNotMatch on MinIO.
        extra = dict(self._client_kwargs)
        if extra.get("endpoint_url"):
            extra["config"] = Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            )
        async with session.client("s3", **extra) as client:
            yield client

    async def upload(self, key: str, content: bytes, content_type: str = "application/octet-stream") -> None:
        async with self._client() as s3:
            await s3.put_object(
                Bucket=self.bucket,
                Key=key,
                Body=content,
                ContentType=content_type,
            )
        logger.debug("S3Storage.upload: s3://%s/%s (%d bytes)", self.bucket, key, len(content))

    async def download(self, key: str) -> bytes:
        async with self._client() as s3:
            try:
                resp = await s3.get_object(Bucket=self.bucket, Key=key)
                data: bytes = await resp["Body"].read()
            except s3.exceptions.NoSuchKey:
                raise FileNotFoundError(f"Storage key not found: s3://{self.bucket}/{key}")
            except Exception as exc:
                # Catch ClientError for other not-found variants (e.g. 404)
                if "NoSuchKey" in str(exc) or "404" in str(exc):
                    raise FileNotFoundError(f"Storage key not found: s3://{self.bucket}/{key}") from exc
                raise
        logger.debug("S3Storage.download: s3://%s/%s (%d bytes)", self.bucket, key, len(data))
        return data

    async def delete(self, key: str) -> None:
        async with self._client() as s3:
            await s3.delete_object(Bucket=self.bucket, Key=key)
        logger.debug("S3Storage.delete: s3://%s/%s", self.bucket, key)

    async def get_url(self, key: str, expires_in: int = 3600) -> str:
        async with self._client() as s3:
            url: str = await s3.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        # Replace internal endpoint with public-facing URL so browsers can access the link
        if self._public_url and self._client_kwargs.get("endpoint_url"):
            internal = self._client_kwargs["endpoint_url"].rstrip("/")
            public = self._public_url.rstrip("/")
            if internal != public:
                url = url.replace(internal, public, 1)
        return url

    async def exists(self, key: str) -> bool:
        async with self._client() as s3:
            try:
                await s3.head_object(Bucket=self.bucket, Key=key)
                return True
            except Exception:
                return False


# ---------------------------------------------------------------------------
# Factory
# ---------------------------------------------------------------------------

def get_storage_provider() -> StorageProvider:
    """Instantiate the configured storage backend."""
    from app.config import settings

    backend = settings.storage_backend

    if backend == "local":
        return LocalStorage(settings.storage_local_path)

    if backend in ("s3", "minio", "oss", "r2"):
        endpoint = settings.storage_s3_endpoint_url or None
        public = settings.storage_s3_public_url or None
        return S3Storage(
            bucket=settings.storage_s3_bucket,
            access_key=settings.storage_s3_access_key,
            secret_key=settings.storage_s3_secret_key,
            region=settings.storage_s3_region,
            endpoint_url=endpoint,
            public_url=public,
        )

    raise ValueError(f"Unknown storage backend: {backend!r}. Choose from: local, s3, minio, oss, r2")


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

_storage_instance: StorageProvider | None = None


def storage() -> StorageProvider:
    """
    Return the module-level singleton StorageProvider.
    Instantiated lazily on first call; safe for use across the application.
    """
    global _storage_instance
    if _storage_instance is None:
        _storage_instance = get_storage_provider()
    return _storage_instance


def reset_storage_instance() -> None:
    """Reset the singleton (useful in tests or after config change)."""
    global _storage_instance
    _storage_instance = None
