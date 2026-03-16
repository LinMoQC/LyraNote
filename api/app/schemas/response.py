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


class ApiResponse(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: T | None = None

    model_config = {"from_attributes": True}


def success(data: Any = None, message: str = "success") -> ApiResponse:
    """Factory for a successful response envelope."""
    return ApiResponse(code=0, message=message, data=data)


def fail(status_code: int, message: str) -> JSONResponse:
    """Factory for an error response envelope (returns JSONResponse directly)."""
    return JSONResponse(
        status_code=status_code,
        content={"code": status_code, "message": message, "data": None},
    )
