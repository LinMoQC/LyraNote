"""
Shared helpers for Celery task execution.

Each Celery task runs in a separate forked process. These utilities
handle the per-task async event loop and DB session lifecycle to avoid
asyncpg 'Event loop is closed' errors across forks.
"""

from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import settings


def _load_db_settings_sync() -> None:
    """Load persisted config (API keys etc.) from DB into in-memory settings."""
    import asyncio as _asyncio
    from sqlalchemy.ext.asyncio import AsyncSession
    from sqlalchemy.ext.asyncio import async_sessionmaker as _asm
    from sqlalchemy.ext.asyncio import create_async_engine as _cae
    from sqlalchemy.pool import NullPool

    async def _load():
        engine = _cae(settings.database_url, poolclass=NullPool)
        factory = _asm(bind=engine, class_=AsyncSession, expire_on_commit=False)
        async with factory() as db:
            from app.domains.setup.router import load_settings_from_db
            await load_settings_from_db(db)
        await engine.dispose()

    loop = _asyncio.new_event_loop()
    try:
        loop.run_until_complete(_load())
    finally:
        loop.close()


@asynccontextmanager
async def _task_db():
    """
    Async context manager that creates a per-task engine + session,
    then explicitly disposes the engine on exit so no asyncpg connections
    are left dangling when the event loop closes.
    """
    engine = create_async_engine(settings.database_url, poolclass=NullPool)
    factory = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        try:
            yield session
        finally:
            pass
    await engine.dispose()


def _run_async(coro):
    """Run an async coroutine in a one-shot event loop."""
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(coro)
    finally:
        try:
            pending = asyncio.all_tasks(loop)
            if pending:
                loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            loop.run_until_complete(loop.shutdown_asyncgens())
            loop.run_until_complete(loop.shutdown_default_executor())
        except Exception:
            pass
        loop.close()
