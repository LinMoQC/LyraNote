"""
Shared pytest fixtures for LyraNote API tests.

Uses the DATABASE_URL environment variable if set (CI uses PostgreSQL),
otherwise falls back to in-memory SQLite for fast local development.
Each test gets a fresh database via function-scoped fixtures.
"""
from __future__ import annotations

import os
import uuid

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool, NullPool

# ── Force test environment before any app imports ────────────────────────────
_db_url = os.environ.get("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("DATABASE_URL", _db_url)
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", "/tmp/lyranote-test-storage")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("DEBUG", "false")

from app.main import app
from app.database import get_db
from app.models import Base
from app.auth import hash_password, create_access_token
from app.models import User

_USE_SQLITE = _db_url.startswith("sqlite")


# ── Database engine ───────────────────────────────────────────────────────────

@pytest_asyncio.fixture(scope="function")
async def engine():
    """Create a fresh database engine per test."""
    if _USE_SQLITE:
        _engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        # PostgreSQL — use NullPool to avoid connection leaks between tests
        _engine = create_async_engine(_db_url, poolclass=NullPool)

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield _engine

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await _engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def db_session(engine):
    """Provide a test database session."""
    session_factory = async_sessionmaker(engine, expire_on_commit=False)
    async with session_factory() as session:
        yield session


@pytest_asyncio.fixture(scope="function")
async def client(engine):
    """
    Provide a test HTTP client with the database dependency overridden
    to use the test engine.
    """
    session_factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db():
        async with session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    app.state.monitoring_session_factory = session_factory

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    if hasattr(app.state, "monitoring_session_factory"):
        delattr(app.state, "monitoring_session_factory")


@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession):
    """Create a test user and return (user, plaintext_password)."""
    password = "testpassword123"
    user = User(
        id=uuid.uuid4(),
        username="testuser",
        email="test@example.com",
        name="Test User",
        password_hash=hash_password(password),
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user, password


@pytest_asyncio.fixture
async def auth_headers(test_user):
    """Return Authorization headers for the test user."""
    user, _ = test_user
    token = create_access_token(user.id)
    return {"Authorization": f"Bearer {token}"}
