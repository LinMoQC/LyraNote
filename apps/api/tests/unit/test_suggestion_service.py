from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app.services.suggestion_service import FALLBACK_SUGGESTIONS, SuggestionService


class _FakeScalarResult:
    def __init__(self, values):
        self._values = values

    def all(self):
        return list(self._values)


class _FakeResult:
    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return list(self._rows)

    def scalars(self):
        return _FakeScalarResult(self._rows)


class _FakeDB:
    def __init__(self, responses):
        self._responses = list(responses)

    async def execute(self, _statement):
        if not self._responses:
            raise AssertionError("Unexpected db.execute call")
        return self._responses.pop(0)


class _FakeRedis:
    def __init__(self):
        self.store = {}

    async def get(self, key):
        return self.store.get(key)

    async def setex(self, key, _ttl, value):
        self.store[key] = value

    async def delete(self, key):
        self.store.pop(key, None)


def _mock_utility_client(content: str):
    create = AsyncMock(
        return_value=SimpleNamespace(
            choices=[SimpleNamespace(message=SimpleNamespace(content=content))]
        )
    )
    client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))
    return client, create


class TestSuggestionService:
    async def test_get_user_suggestions_warms_cache_on_miss(self):
        user_id = uuid.uuid4()
        redis = _FakeRedis()
        db = _FakeDB([
            _FakeResult([("论文A", "摘要A")]),
            _FakeResult([("对话A",)]),
        ])
        utility_client, create_mock = _mock_utility_client('["问题1","问题2","问题3","问题4"]')
        service = SuggestionService(db, redis_client=redis, utility_client=utility_client)

        suggestions = await service.get_user_suggestions(user_id)
        cached = await service._read_cached_payload(str(user_id))

        assert suggestions == ["问题1", "问题2", "问题3", "问题4"]
        assert cached is not None
        assert cached["suggestions"] == ["问题1", "问题2", "问题3", "问题4"]
        create_mock.assert_awaited_once()

    async def test_get_user_suggestions_returns_fallback_when_miss_has_no_context(self):
        user_id = uuid.uuid4()
        redis = _FakeRedis()
        db = _FakeDB([
            _FakeResult([]),
            _FakeResult([]),
        ])
        utility_client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(
                    create=AsyncMock(side_effect=AssertionError("LLM should not run without context"))
                )
            )
        )
        service = SuggestionService(db, redis_client=redis, utility_client=utility_client)

        suggestions = await service.get_user_suggestions(user_id)

        assert suggestions == FALLBACK_SUGGESTIONS
        utility_client.chat.completions.create.assert_not_awaited()

    async def test_refresh_user_suggestions_generates_and_caches(self):
        user_id = uuid.uuid4()
        db = _FakeDB([
            _FakeResult([("论文A", "摘要A")]),  # source rows
            _FakeResult([("对话A",)]),  # conversation rows
        ])
        redis = _FakeRedis()
        utility_client, create_mock = _mock_utility_client('["问题1","问题2","问题3","问题4"]')
        service = SuggestionService(db, redis_client=redis, utility_client=utility_client)

        refreshed = await service.refresh_user_suggestions(user_id)
        cached = await service._read_cached_payload(str(user_id))

        assert refreshed is True
        assert cached is not None
        assert cached["suggestions"] == ["问题1", "问题2", "问题3", "问题4"]
        create_mock.assert_awaited_once()

    async def test_refresh_user_suggestions_skips_when_fingerprint_unchanged(self):
        user_id = uuid.uuid4()
        src_rows = [("论文A", "摘要A")]
        conv_titles = ["对话A"]
        db = _FakeDB([
            _FakeResult(src_rows),
            _FakeResult([(conv_titles[0],)]),
        ])
        redis = _FakeRedis()
        utility_client, create_mock = _mock_utility_client('["新问题1","新问题2","新问题3","新问题4"]')
        service = SuggestionService(db, redis_client=redis, utility_client=utility_client)

        fingerprint = service._compute_fingerprint(src_rows, conv_titles)
        await service._write_cached_payload(
            str(user_id),
            {
                "suggestions": ["旧问题1", "旧问题2", "旧问题3", "旧问题4"],
                "fingerprint": fingerprint,
            },
        )

        refreshed = await service.refresh_user_suggestions(user_id)
        cached = await service._read_cached_payload(str(user_id))

        assert refreshed is False
        assert cached is not None
        assert cached["suggestions"] == ["旧问题1", "旧问题2", "旧问题3", "旧问题4"]
        create_mock.assert_not_awaited()
