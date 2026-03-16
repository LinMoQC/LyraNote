"""
FastAPI dependency injection: DB session, current user auth.
"""

from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import User

bearer_scheme = HTTPBearer(auto_error=False)

_COOKIE_NAME = "lyranote_session"


async def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> User:
    # Prefer Authorization: Bearer header; fall back to httpOnly cookie
    token: str | None = None
    if credentials is not None:
        token = credentials.credentials
    else:
        token = request.cookies.get(_COOKIE_NAME)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
        )

    from app.auth import verify_local_token

    try:
        user_id = verify_local_token(token)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
        )
    return user


# Convenience type aliases
DbDep = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]
