"""
Unified API response envelope.

All endpoints return:
  - Success: HTTP 2xx  + {"code": 0,   "message": "success", "data": <payload>}
  - Failure: HTTP 4xx/5xx + {"code": <status>, "message": "<desc>", "data": null}

SSE / StreamingResponse endpoints are exempt and return raw streams.
"""

from __future__ import annotations

from typing import Any, Generic, TypeVar

from fastapi.responses import JSONResponse
from pydantic import BaseModel

T = TypeVar("T")

# Business-level status codes (inside the envelope, NOT HTTP status codes)
CODE_SUCCESS = 0
CODE_NOT_CONFIGURED = 1001


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: T | None = None

    model_config = {"from_attributes": True}


def success(data: Any = None, message: str = "success") -> ApiResponse:
    """Factory for a successful response envelope."""
    return ApiResponse(code=0, message=message, data=data)


def not_configured(message: str = "系统未初始化") -> ApiResponse:
    """Response indicating the system has not been initialized yet."""
    return ApiResponse(code=CODE_NOT_CONFIGURED, message=message)


def fail(status_code: int, message: str) -> JSONResponse:
    """Factory for an error response envelope (returns JSONResponse directly)."""
    return JSONResponse(
        status_code=status_code,
        content={"code": status_code, "message": message, "data": None},
    )
