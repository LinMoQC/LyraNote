"""
Custom exception hierarchy for LyraNote API.

Usage:
    raise NotFoundError("笔记本不存在")
    raise ForbiddenError()
    raise BadRequestError("参数无效")

All AppError subclasses are caught by the global exception handler in main.py
and serialised into the unified ApiResponse envelope.
"""

from __future__ import annotations


class AppError(Exception):
    """Base class for all application-level errors."""

    status_code: int = 500
    default_message: str = "服务器内部错误"

    def __init__(self, message: str | None = None, *, code: int | None = None):
        self.message = message or self.default_message
        self.code = code or self.status_code
        super().__init__(self.message)


class BadRequestError(AppError):
    status_code = 400
    default_message = "请求参数错误"


class UnauthorizedError(AppError):
    status_code = 401
    default_message = "未登录或登录已过期"


class ForbiddenError(AppError):
    status_code = 403
    default_message = "无权限访问"


class NotFoundError(AppError):
    status_code = 404
    default_message = "资源不存在"


class ConflictError(AppError):
    status_code = 409
    default_message = "资源冲突"


class UnprocessableError(AppError):
    status_code = 422
    default_message = "请求数据无法处理"


class InternalError(AppError):
    status_code = 500
    default_message = "服务器内部错误"
