import logging
from collections.abc import Callable
from typing import Any

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Session

from app.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_pre_ping=True,
    **({} if _is_sqlite else {"pool_size": settings.db_pool_size, "max_overflow": settings.db_max_overflow}),
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

logger = logging.getLogger(__name__)
_AFTER_COMMIT_CALLBACKS_KEY = "_after_commit_callbacks"


class Base(DeclarativeBase):
    pass


def enqueue_after_commit(session: AsyncSession, callback: Callable[[], Any]) -> None:
    """
    Queue a synchronous callback to run after the current SQLAlchemy transaction commits.

    This is primarily used for side effects like Celery task dispatch, where running the
    side effect before commit can race the worker reading rows that are not yet visible.
    Falls back to immediate execution for test doubles that do not expose a sync session.
    """
    sync_session = getattr(session, "sync_session", None)
    info = getattr(sync_session, "info", None)
    if info is None:
        callback()
        return
    info.setdefault(_AFTER_COMMIT_CALLBACKS_KEY, []).append(callback)


@event.listens_for(Session, "after_commit")
def _run_after_commit_callbacks(session: Session) -> None:
    callbacks = session.info.pop(_AFTER_COMMIT_CALLBACKS_KEY, [])
    for callback in callbacks:
        try:
            callback()
        except Exception:
            logger.exception("after-commit callback failed")


@event.listens_for(Session, "after_rollback")
def _clear_after_commit_callbacks(session: Session) -> None:
    session.info.pop(_AFTER_COMMIT_CALLBACKS_KEY, None)


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
