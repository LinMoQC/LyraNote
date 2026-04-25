from __future__ import annotations

import pytest

from app.agents.soul.soul import AgentSoul


class _FakeRedis:
    def __init__(self) -> None:
        self.published: list[tuple[str, str]] = []
        self.cooldowns: list[tuple[str, int, str]] = []

    async def exists(self, key: str) -> int:
        return 0

    async def publish(self, channel: str, payload: str) -> None:
        self.published.append((channel, payload))

    async def setex(self, key: str, ttl: int, value: str) -> None:
        self.cooldowns.append((key, ttl, value))


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "activity",
    [
        {"typing_recently": True},
        {"copilot_open": True},
        {"is_mobile": True},
    ],
)
async def test_agent_soul_keeps_thought_internal_in_high_interrupt_contexts(activity, monkeypatch) -> None:
    fake_redis = _FakeRedis()
    stored_visibilities: list[str] = []

    async def fake_chat(*args, **kwargs) -> str:
        return '{"should_surface": true, "content": "test thought", "reasoning": "ok"}'

    async def fake_store_thought(**kwargs) -> None:
        stored_visibilities.append(kwargs["visibility"])

    monkeypatch.setattr("app.providers.llm.chat", fake_chat)
    monkeypatch.setattr("app.providers.llm.get_utility_model", lambda: "test-model")
    monkeypatch.setattr("app.agents.soul.soul._store_thought", fake_store_thought)

    soul = AgentSoul()
    await soul._think(user_id="00000000-0000-0000-0000-000000000001", activity=activity, redis=fake_redis)

    assert fake_redis.published == []
    assert fake_redis.cooldowns == []
    assert stored_visibilities == ["internal"]


@pytest.mark.asyncio
async def test_agent_soul_uses_thirty_minute_surface_cooldown(monkeypatch) -> None:
    fake_redis = _FakeRedis()

    async def fake_chat(*args, **kwargs) -> str:
        return '{"should_surface": true, "content": "test thought", "reasoning": "ok"}'

    async def fake_store_thought(**kwargs) -> None:
        return None

    monkeypatch.setattr("app.providers.llm.chat", fake_chat)
    monkeypatch.setattr("app.providers.llm.get_utility_model", lambda: "test-model")
    monkeypatch.setattr("app.agents.soul.soul._store_thought", fake_store_thought)

    soul = AgentSoul()
    await soul._think(
        user_id="00000000-0000-0000-0000-000000000001",
        activity={"typing_recently": False, "copilot_open": False, "is_mobile": False},
        redis=fake_redis,
    )

    assert len(fake_redis.published) == 1
    assert fake_redis.cooldowns == [("soul_cooldown:00000000-0000-0000-0000-000000000001", 1800, "1")]
