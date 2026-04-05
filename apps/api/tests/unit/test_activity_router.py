from __future__ import annotations

import json

import pytest


class _FakeRedis:
    def __init__(self) -> None:
        self.calls: list[tuple[str, int, str]] = []

    async def __aenter__(self) -> "_FakeRedis":
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def setex(self, key: str, ttl: int, payload: str) -> None:
        self.calls.append((key, ttl, payload))


@pytest.mark.asyncio
async def test_activity_heartbeat_accepts_surface_control_fields(
    client,
    auth_headers,
    monkeypatch,
    test_user,
) -> None:
    user, _ = test_user
    fake_redis = _FakeRedis()
    monkeypatch.setattr("app.domains.activity.router.aioredis.from_url", lambda *args, **kwargs: fake_redis)

    response = await client.post(
        "/api/v1/activity/heartbeat",
        headers=auth_headers,
        json={
            "action": "reading",
            "notebook_id": "nb-1",
            "copilot_open": True,
            "is_mobile": True,
            "typing_recently": True,
            "last_interaction_ms": 123456,
            "timestamp_ms": 999,
        },
    )

    assert response.status_code == 200
    assert len(fake_redis.calls) == 1

    key, ttl, payload = fake_redis.calls[0]
    body = json.loads(payload)

    assert key == f"activity:{user.id}"
    assert ttl == 120
    assert body["copilot_open"] is True
    assert body["is_mobile"] is True
    assert body["typing_recently"] is True
    assert body["last_interaction_ms"] == 123456
