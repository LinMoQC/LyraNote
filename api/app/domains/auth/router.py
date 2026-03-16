"""
Auth domain: login / logout / me / OAuth (Google & GitHub)
"""

from __future__ import annotations

import secrets
import uuid

import httpx
from fastapi import APIRouter, HTTPException, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import func, select

from app.config import settings
from app.dependencies import CurrentUser, DbDep
from app.exceptions import BadRequestError, UnauthorizedError
from app.models import User
from app.schemas.response import ApiResponse, success

router = APIRouter(tags=["auth"])

_COOKIE_NAME = "lyranote_session"
_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days

# In-memory CSRF state store (suitable for single-process dev; swap Redis for multi-process prod)
_oauth_states: dict[str, str] = {}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )


async def _upsert_oauth_user(
    db,
    *,
    provider: str,
    provider_id: str,
    email: str | None,
    name: str | None,
    avatar_url: str | None,
) -> User:
    """Find or create a User for the given OAuth identity."""
    id_field = User.google_id if provider == "google" else User.github_id

    result = await db.execute(select(User).where(id_field == provider_id))
    user = result.scalar_one_or_none()
    if user:
        return user

    if email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user:
            unbound = (user.oauth_unbound or "").split(",")
            unbound = [p.strip().lower() for p in unbound if p.strip()]
            if provider.lower() in unbound:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="您已解绑该第三方账号。请先用密码登录，再在设置中重新绑定。",
                )
            if provider == "google":
                user.google_id = provider_id
            else:
                user.github_id = provider_id
            if not user.avatar_url and avatar_url:
                user.avatar_url = avatar_url
            await db.commit()
            await db.refresh(user)
            return user

    # 已有用户时，不自动绑定 OAuth —— 用户必须先用密码登录，再到设置中手动绑定
    count_result = await db.execute(select(func.count()).select_from(User))
    user_count = count_result.scalar()
    if user_count >= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该第三方账号尚未绑定。请先使用密码登录，然后在「设置 → 安全」中绑定后再使用第三方登录。",
        )

    # 系统无用户时（首次 OAuth 登录）：创建新用户
    user = User(
        id=str(uuid.uuid4()),
        email=email,
        name=name,
        avatar_url=avatar_url,
    )
    if provider == "google":
        user.google_id = provider_id
    else:
        user.github_id = provider_id

    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    username: str | None
    name: str | None
    email: str | None
    avatar_url: str | None = None
    has_google: bool = False
    has_github: bool = False

    model_config = {"from_attributes": True}


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    avatar_url: str | None = None


class PasswordUpdateRequest(BaseModel):
    old_password: str
    new_password: str


@router.post("/auth/login", response_model=ApiResponse[TokenResponse])
async def login(body: LoginRequest, response: Response, db: DbDep):
    result = await db.execute(select(User).where(User.username == body.username))
    user = result.scalar_one_or_none()

    if user is None or not user.password_hash:
        raise UnauthorizedError("用户名或密码错误")

    from app.auth import verify_password, create_access_token
    from app.config import settings

    if not verify_password(body.password, user.password_hash):
        raise UnauthorizedError("用户名或密码错误")

    token = create_access_token(user.id, expire_days=settings.jwt_expire_days)

    response.set_cookie(
        key=_COOKIE_NAME,
        value=token,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )

    return success(TokenResponse(access_token=token))


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response):
    response.delete_cookie(key=_COOKIE_NAME, path="/")


@router.get("/auth/me", response_model=ApiResponse[UserOut])
async def me(current_user: CurrentUser):
    return success(UserOut(
        id=str(current_user.id),
        username=current_user.username,
        name=current_user.name,
        email=current_user.email,
        avatar_url=current_user.avatar_url,
        has_google=bool(current_user.google_id),
        has_github=bool(current_user.github_id),
    ))


@router.patch("/auth/profile", response_model=ApiResponse[UserOut])
async def update_profile(body: ProfileUpdateRequest, current_user: CurrentUser, db: DbDep):
    if body.name is not None:
        current_user.name = body.name.strip() or None
    if body.avatar_url is not None:
        current_user.avatar_url = body.avatar_url.strip() or None
    await db.commit()
    await db.refresh(current_user)
    return success(UserOut(
        id=str(current_user.id),
        username=current_user.username,
        name=current_user.name,
        email=current_user.email,
        avatar_url=current_user.avatar_url,
        has_google=bool(current_user.google_id),
        has_github=bool(current_user.github_id),
    ))


@router.patch("/auth/password", status_code=status.HTTP_204_NO_CONTENT)
async def update_password(body: PasswordUpdateRequest, current_user: CurrentUser, db: DbDep):
    from app.auth import verify_password, hash_password

    if not current_user.password_hash or not verify_password(body.old_password, current_user.password_hash):
        raise BadRequestError("旧密码不正确")
    if len(body.new_password) < 6:
        raise BadRequestError("新密码至少 6 位")
    current_user.password_hash = hash_password(body.new_password)
    await db.commit()


# ---------------------------------------------------------------------------
# OAuth — Google
# ---------------------------------------------------------------------------

@router.get("/auth/oauth/google")
async def oauth_google_authorize():
    from app.config import settings

    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth 未配置")

    state = secrets.token_urlsafe(16)
    _oauth_states[state] = "google"

    redirect_uri = f"{settings.oauth_base_url}/auth/oauth/google/callback"
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.google_client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
        f"&state={state}"
    )
    return RedirectResponse(url=url)


@router.get("/auth/oauth/google/callback")
async def oauth_google_callback(code: str, state: str, response: Response, db: DbDep):
    from app.auth import create_access_token
    from app.config import settings

    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="无效的 state 参数，请重试")
    state_val = _oauth_states.pop(state)

    redirect_uri = f"{settings.oauth_base_url}/auth/oauth/google/callback"

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Google token 换取失败")
        token_data = token_resp.json()
        access_token = token_data.get("access_token")

        userinfo_resp = await client.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if userinfo_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="Google 用户信息获取失败")
        info = userinfo_resp.json()

    # Bind mode: attach google_id to existing user and redirect back to settings
    if state_val.startswith("bind:google:"):
        user_id = state_val.split(":", 2)[2]
        result = await db.execute(select(User).where(User.id == user_id))
        bind_user = result.scalar_one_or_none()
        if bind_user:
            bind_user.google_id = info["sub"]
            if not bind_user.avatar_url and info.get("picture"):
                bind_user.avatar_url = info["picture"]
            _remove_oauth_unbound(bind_user, "google")
            await db.commit()
        return RedirectResponse(url=f"{settings.frontend_url}/app?settings=security", status_code=302)

    user = await _upsert_oauth_user(
        db,
        provider="google",
        provider_id=info["sub"],
        email=info.get("email"),
        name=info.get("name"),
        avatar_url=info.get("picture"),
    )

    jwt = create_access_token(user.id, expire_days=settings.jwt_expire_days)
    redirect = RedirectResponse(url=f"{settings.frontend_url}/app", status_code=302)
    redirect.set_cookie(
        key=_COOKIE_NAME,
        value=jwt,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return redirect


# ---------------------------------------------------------------------------
# OAuth — GitHub
# ---------------------------------------------------------------------------

@router.get("/auth/oauth/github")
async def oauth_github_authorize():
    from app.config import settings

    if not settings.github_client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth 未配置")

    state = secrets.token_urlsafe(16)
    _oauth_states[state] = "github"

    redirect_uri = f"{settings.oauth_base_url}/auth/oauth/github/callback"
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=read:user%20user:email"
        f"&state={state}"
    )
    return RedirectResponse(url=url)


@router.get("/auth/oauth/github/callback")
async def oauth_github_callback(code: str, state: str, db: DbDep):
    from app.auth import create_access_token
    from app.config import settings

    if state not in _oauth_states:
        raise HTTPException(status_code=400, detail="无效的 state 参数，请重试")
    state_val = _oauth_states.pop(state)

    redirect_uri = f"{settings.oauth_base_url}/auth/oauth/github/callback"

    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            data={
                "code": code,
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "redirect_uri": redirect_uri,
            },
            headers={"Accept": "application/json"},
        )
        if token_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="GitHub token 换取失败")
        token_data = token_resp.json()
        gh_token = token_data.get("access_token")
        if not gh_token:
            raise HTTPException(status_code=400, detail="GitHub token 换取失败")

        user_resp = await client.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/json"},
        )
        if user_resp.status_code != 200:
            raise HTTPException(status_code=400, detail="GitHub 用户信息获取失败")
        gh_user = user_resp.json()

        email: str | None = gh_user.get("email")
        if not email:
            emails_resp = await client.get(
                "https://api.github.com/user/emails",
                headers={"Authorization": f"Bearer {gh_token}", "Accept": "application/json"},
            )
            if emails_resp.status_code == 200:
                for e in emails_resp.json():
                    if e.get("primary") and e.get("verified"):
                        email = e["email"]
                        break

    # Bind mode
    if state_val.startswith("bind:github:"):
        user_id = state_val.split(":", 2)[2]
        result = await db.execute(select(User).where(User.id == user_id))
        bind_user = result.scalar_one_or_none()
        if bind_user:
            bind_user.github_id = str(gh_user["id"])
            if not bind_user.avatar_url and gh_user.get("avatar_url"):
                bind_user.avatar_url = gh_user["avatar_url"]
            _remove_oauth_unbound(bind_user, "github")
            await db.commit()
        return RedirectResponse(url=f"{settings.frontend_url}/app?settings=security", status_code=302)

    user = await _upsert_oauth_user(
        db,
        provider="github",
        provider_id=str(gh_user["id"]),
        email=email,
        name=gh_user.get("name") or gh_user.get("login"),
        avatar_url=gh_user.get("avatar_url"),
    )

    jwt = create_access_token(user.id, expire_days=settings.jwt_expire_days)
    redirect = RedirectResponse(url=f"{settings.frontend_url}/app", status_code=302)
    redirect.set_cookie(
        key=_COOKIE_NAME,
        value=jwt,
        max_age=_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/",
    )
    return redirect


# ---------------------------------------------------------------------------
# OAuth — Bind (已登录用户绑定第三方账号)
# ---------------------------------------------------------------------------

@router.get("/auth/oauth/google/bind")
async def oauth_google_bind(current_user: CurrentUser):
    from app.config import settings
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth 未配置")
    state = secrets.token_urlsafe(16)
    _oauth_states[state] = f"bind:google:{current_user.id}"
    redirect_uri = f"{settings.oauth_base_url}/auth/oauth/google/callback"
    url = (
        "https://accounts.google.com/o/oauth2/v2/auth"
        f"?client_id={settings.google_client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&response_type=code"
        f"&scope=openid%20email%20profile"
        f"&state={state}"
    )
    return RedirectResponse(url=url)


@router.get("/auth/oauth/github/bind")
async def oauth_github_bind(current_user: CurrentUser):
    from app.config import settings
    if not settings.github_client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth 未配置")
    state = secrets.token_urlsafe(16)
    _oauth_states[state] = f"bind:github:{current_user.id}"
    redirect_uri = f"{settings.oauth_base_url}/auth/oauth/github/callback"
    url = (
        "https://github.com/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope=read:user%20user:email"
        f"&state={state}"
    )
    return RedirectResponse(url=url)


def _add_oauth_unbound(user: User, provider: str) -> None:
    parts = [p.strip() for p in (user.oauth_unbound or "").split(",") if p.strip()]
    if provider not in parts:
        parts.append(provider)
    user.oauth_unbound = ",".join(parts)


def _remove_oauth_unbound(user: User, provider: str) -> None:
    parts = [p.strip() for p in (user.oauth_unbound or "").split(",") if p.strip() and p.lower() != provider.lower()]
    user.oauth_unbound = ",".join(parts) if parts else None


@router.delete("/auth/oauth/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def oauth_unbind(provider: str, current_user: CurrentUser, db: DbDep):
    if provider not in ("google", "github"):
        raise HTTPException(status_code=400, detail="不支持的 provider")
    if provider == "google":
        if not current_user.google_id:
            raise HTTPException(status_code=400, detail="未绑定 Google 账号")
        if not current_user.password_hash and not current_user.github_id:
            raise HTTPException(status_code=400, detail="请先设置密码再解绑，否则将无法登录")
        current_user.google_id = None
    else:
        if not current_user.github_id:
            raise HTTPException(status_code=400, detail="未绑定 GitHub 账号")
        if not current_user.password_hash and not current_user.google_id:
            raise HTTPException(status_code=400, detail="请先设置密码再解绑，否则将无法登录")
        current_user.github_id = None
    _add_oauth_unbound(current_user, provider)
    await db.commit()
