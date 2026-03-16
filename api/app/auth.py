"""
Local password auth + JWT (HS256).
Replaces the previous Clerk JWKS-based verification.
"""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

import bcrypt
from jose import JWTError, jwt

# Lazily-resolved secret so we can import this module before settings are loaded
_runtime_secret: str | None = None


def _get_secret() -> str:
    global _runtime_secret
    if _runtime_secret:
        return _runtime_secret
    from app.config import settings
    if settings.jwt_secret:
        _runtime_secret = settings.jwt_secret
    else:
        # Dev fallback: generate once per process (tokens expire on restart)
        _runtime_secret = secrets.token_hex(32)
    return _runtime_secret


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: UUID, expire_days: int = 30) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=expire_days)
    return jwt.encode(
        {"sub": str(user_id), "exp": expire},
        _get_secret(),
        algorithm="HS256",
    )


def verify_local_token(token: str) -> UUID:
    """Decode and validate a local JWT, returning the user UUID."""
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=["HS256"])
        return UUID(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise ValueError(f"Invalid token: {exc}") from exc
