from __future__ import annotations

import contextlib
import contextvars
import uuid
from collections.abc import Iterator

_trace_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("trace_id", default=None)
_run_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("observability_run_id", default=None)


def generate_trace_id() -> str:
    return uuid.uuid4().hex


def get_trace_id() -> str | None:
    return _trace_id_var.get()


def set_trace_id(trace_id: str | None) -> contextvars.Token[str | None]:
    return _trace_id_var.set(trace_id)


def reset_trace_id(token: contextvars.Token[str | None]) -> None:
    _trace_id_var.reset(token)


def get_observability_run_id() -> str | None:
    return _run_id_var.get()


def set_observability_run_id(run_id: str | None) -> contextvars.Token[str | None]:
    return _run_id_var.set(run_id)


def reset_observability_run_id(token: contextvars.Token[str | None]) -> None:
    _run_id_var.reset(token)


@contextlib.contextmanager
def bind_trace_context(
    trace_id: str | None = None,
    *,
    run_id: str | None = None,
) -> Iterator[str | None]:
    trace_token = set_trace_id(trace_id)
    run_token = set_observability_run_id(run_id)
    try:
        yield trace_id
    finally:
        reset_observability_run_id(run_token)
        reset_trace_id(trace_token)
