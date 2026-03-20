"""
Unit tests for the API response envelope utilities.

No DB, no HTTP — these tests run in milliseconds.

Covers:
  success()          — factory for successful ApiResponse
  fail()             — factory for error JSONResponse
  not_configured()   — factory for "system not initialised" response
  ApiResponse        — generic Pydantic model
"""
from __future__ import annotations

import json
import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", "/tmp/lyranote-test-storage")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("DEBUG", "false")

from fastapi.responses import JSONResponse

from app.schemas.response import (
    CODE_NOT_CONFIGURED,
    ApiResponse,
    fail,
    not_configured,
    success,
)


# ── success() ─────────────────────────────────────────────────────────────────

class TestSuccessFactory:
    def test_no_args_returns_zero_code(self):
        resp = success()
        assert resp.code == 0

    def test_no_args_default_message(self):
        resp = success()
        assert resp.message == "success"

    def test_no_args_data_is_none(self):
        resp = success()
        assert resp.data is None

    def test_dict_data_passed_through(self):
        resp = success(data={"key": "value", "count": 42})
        assert resp.data == {"key": "value", "count": 42}

    def test_list_data_passed_through(self):
        resp = success(data=[1, 2, 3])
        assert resp.data == [1, 2, 3]

    def test_custom_message(self):
        resp = success(message="created")
        assert resp.message == "created"

    def test_returns_api_response_instance(self):
        resp = success(data="hello")
        assert isinstance(resp, ApiResponse)

    def test_string_data_passed_through(self):
        resp = success(data="plain string")
        assert resp.data == "plain string"

    def test_nested_dict_data(self):
        data = {"outer": {"inner": [1, 2, 3]}}
        resp = success(data=data)
        assert resp.data["outer"]["inner"] == [1, 2, 3]


# ── fail() ────────────────────────────────────────────────────────────────────

class TestFailFactory:
    def test_404_status_code(self):
        resp = fail(404, "not found")
        assert resp.status_code == 404

    def test_422_status_code(self):
        resp = fail(422, "unprocessable entity")
        assert resp.status_code == 422

    def test_500_status_code(self):
        resp = fail(500, "internal server error")
        assert resp.status_code == 500

    def test_returns_json_response(self):
        resp = fail(400, "bad request")
        assert isinstance(resp, JSONResponse)

    def test_body_code_matches_status(self):
        resp = fail(403, "forbidden")
        body = json.loads(resp.body)
        assert body["code"] == 403

    def test_body_message_set(self):
        resp = fail(404, "not found")
        body = json.loads(resp.body)
        assert body["message"] == "not found"

    def test_body_data_is_null(self):
        resp = fail(404, "not found")
        body = json.loads(resp.body)
        assert body["data"] is None

    def test_body_has_three_keys(self):
        resp = fail(400, "bad")
        body = json.loads(resp.body)
        assert set(body.keys()) == {"code", "message", "data"}


# ── not_configured() ──────────────────────────────────────────────────────────

class TestNotConfiguredFactory:
    def test_default_code_is_1001(self):
        resp = not_configured()
        assert resp.code == CODE_NOT_CONFIGURED
        assert resp.code == 1001

    def test_default_message_is_chinese(self):
        resp = not_configured()
        assert resp.message == "系统未初始化"

    def test_custom_message_overrides_default(self):
        resp = not_configured(message="please set up")
        assert resp.message == "please set up"

    def test_returns_api_response_instance(self):
        resp = not_configured()
        assert isinstance(resp, ApiResponse)

    def test_data_is_none(self):
        resp = not_configured()
        assert resp.data is None


# ── ApiResponse model ─────────────────────────────────────────────────────────

class TestApiResponseModel:
    def test_model_validate_minimal(self):
        resp = ApiResponse.model_validate({"code": 0, "message": "ok", "data": None})
        assert resp.code == 0
        assert resp.message == "ok"
        assert resp.data is None

    def test_model_dump_contains_all_keys(self):
        resp = success(data={"x": 1})
        dumped = resp.model_dump()
        assert "code" in dumped
        assert "message" in dumped
        assert "data" in dumped

    def test_model_dump_values_correct(self):
        resp = success(data=42, message="done")
        dumped = resp.model_dump()
        assert dumped["code"] == 0
        assert dumped["message"] == "done"
        assert dumped["data"] == 42

    def test_default_code_is_zero(self):
        resp = ApiResponse()
        assert resp.code == 0

    def test_default_message_is_success(self):
        resp = ApiResponse()
        assert resp.message == "success"

    def test_model_json_serialisable(self):
        resp = success(data={"list": [1, 2, 3]})
        serialised = resp.model_dump_json()
        parsed = json.loads(serialised)
        assert parsed["data"]["list"] == [1, 2, 3]

    def test_from_attributes_config_present(self):
        """from_attributes=True must be set so ORM objects can be wrapped."""
        config = ApiResponse.model_config
        assert config.get("from_attributes") is True
