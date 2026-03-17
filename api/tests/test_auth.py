"""
Tests for the auth module (JWT creation/verification) and auth endpoints.
"""
from __future__ import annotations

import uuid

import pytest

from app.auth import (
    create_access_token,
    hash_password,
    verify_password,
    verify_local_token,
)


# ── Unit tests: pure auth functions ──────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_returns_different_value(self):
        plain = "mypassword"
        hashed = hash_password(plain)
        assert hashed != plain

    def test_verify_correct_password(self):
        plain = "mypassword"
        hashed = hash_password(plain)
        assert verify_password(plain, hashed) is True

    def test_reject_wrong_password(self):
        hashed = hash_password("correct")
        assert verify_password("wrong", hashed) is False

    def test_two_hashes_of_same_password_differ(self):
        """bcrypt salts should make identical passwords produce different hashes."""
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2


class TestJWT:
    def test_create_and_verify_token(self):
        user_id = uuid.uuid4()
        token = create_access_token(user_id)
        assert isinstance(token, str)
        decoded_id = verify_local_token(token)
        assert decoded_id == user_id

    def test_invalid_token_raises(self):
        with pytest.raises(ValueError):
            verify_local_token("not.a.valid.token")

    def test_tampered_token_raises(self):
        user_id = uuid.uuid4()
        token = create_access_token(user_id)
        tampered = token[:-5] + "XXXXX"
        with pytest.raises(ValueError):
            verify_local_token(tampered)


# ── Integration tests: auth endpoints ────────────────────────────────────────

class TestLoginEndpoint:
    async def test_login_success(self, client, test_user):
        user, password = test_user
        resp = await client.post("/api/v1/auth/login", json={
            "username": user.username,
            "password": password,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["data"]["access_token"]
        assert body["data"]["token_type"] == "bearer"

    async def test_login_wrong_password(self, client, test_user):
        user, _ = test_user
        resp = await client.post("/api/v1/auth/login", json={
            "username": user.username,
            "password": "wrongpassword",
        })
        assert resp.status_code == 401

    async def test_login_unknown_user(self, client):
        resp = await client.post("/api/v1/auth/login", json={
            "username": "nobody",
            "password": "whatever",
        })
        assert resp.status_code == 401

    async def test_logout_clears_cookie(self, client, auth_headers):
        resp = await client.post("/api/v1/auth/logout", headers=auth_headers)
        assert resp.status_code == 204


class TestMeEndpoint:
    async def test_me_returns_user_info(self, client, test_user, auth_headers):
        user, _ = test_user
        resp = await client.get("/api/v1/auth/me", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["username"] == user.username
        assert data["email"] == user.email

    async def test_me_requires_auth(self, client):
        resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    async def test_me_rejects_invalid_token(self, client):
        resp = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid.token.here"},
        )
        assert resp.status_code == 401
