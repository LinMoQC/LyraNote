"""
Tests for app/agents/rag/graph_retrieval.py

All DB calls are mocked so no real database is needed.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.agents.rag.graph_retrieval import (
    GRAPH_CONTEXT_BANNER,
    _tokenize_query,
    expand_entity_neighborhood,
    format_graph_context,
    graph_augmented_context,
    match_entities_from_query,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_entity(
    name: str,
    entity_type: str = "concept",
    description: str | None = None,
    mention_count: int = 1,
) -> MagicMock:
    e = MagicMock()
    e.id = uuid.uuid4()
    e.name = name
    e.entity_type = entity_type
    e.description = description
    e.mention_count = mention_count
    return e


def _make_relation(
    src_id: uuid.UUID,
    tgt_id: uuid.UUID,
    relation_type: str = "related_to",
    weight: float = 0.8,
) -> MagicMock:
    r = MagicMock()
    r.id = uuid.uuid4()
    r.source_entity_id = src_id
    r.target_entity_id = tgt_id
    r.relation_type = relation_type
    r.weight = weight
    r.description = None
    return r


def _async_db(scalars_return=None):
    """Build a minimal AsyncSession mock that returns scalars_return from execute()."""
    scalars_return = scalars_return or []
    scalars_mock = MagicMock()
    scalars_mock.all.return_value = scalars_return
    result_mock = MagicMock()
    result_mock.scalars.return_value = scalars_mock
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result_mock)
    return db


# ---------------------------------------------------------------------------
# _tokenize_query
# ---------------------------------------------------------------------------

class TestTokenizeQuery:
    def test_empty_string(self):
        assert _tokenize_query("") == []

    def test_single_word(self):
        tokens = _tokenize_query("深度学习")
        assert "深度学习" in tokens

    def test_splits_on_spaces(self):
        tokens = _tokenize_query("deep learning model")
        assert "deep" in tokens
        assert "learning" in tokens
        assert "model" in tokens

    def test_bigrams_included(self):
        tokens = _tokenize_query("deep learning")
        assert "deep learning" in tokens

    def test_deduplicates(self):
        tokens = _tokenize_query("test test")
        assert tokens.count("test") == 1

    def test_filters_single_chars(self):
        tokens = _tokenize_query("a b c deep")
        assert "a" not in tokens
        assert "b" not in tokens
        assert "deep" in tokens


# ---------------------------------------------------------------------------
# match_entities_from_query
# ---------------------------------------------------------------------------

class TestMatchEntitiesFromQuery:
    @pytest.mark.asyncio
    async def test_empty_query_returns_empty(self):
        db = AsyncMock()
        result = await match_entities_from_query("", None, db)
        assert result == []
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_whitespace_only_returns_empty(self):
        db = AsyncMock()
        result = await match_entities_from_query("   ", None, db)
        assert result == []
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_returns_matched_entities(self):
        entity = _make_entity("深度学习", "technology")
        db = _async_db(scalars_return=[entity])
        result = await match_entities_from_query("什么是深度学习", None, db)
        assert len(result) == 1
        assert result[0].name == "深度学习"

    @pytest.mark.asyncio
    async def test_no_match_returns_empty(self):
        db = _async_db(scalars_return=[])
        result = await match_entities_from_query("随便一些词", None, db)
        assert result == []

    @pytest.mark.asyncio
    async def test_notebook_id_filters_scope(self):
        """Passing notebook_id should not raise; DB receives the query."""
        entity = _make_entity("Transformer")
        db = _async_db(scalars_return=[entity])
        nb_id = str(uuid.uuid4())
        result = await match_entities_from_query("Transformer model", nb_id, db)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_invalid_notebook_id_does_not_raise(self):
        """Bad notebook_id UUID should be silently ignored."""
        entity = _make_entity("Test")
        db = _async_db(scalars_return=[entity])
        result = await match_entities_from_query("Test query", "not-a-uuid", db)
        assert isinstance(result, list)


# ---------------------------------------------------------------------------
# expand_entity_neighborhood
# ---------------------------------------------------------------------------

class TestExpandEntityNeighborhood:
    @pytest.mark.asyncio
    async def test_empty_seed_ids_returns_empty(self):
        db = AsyncMock()
        entities, relations = await expand_entity_neighborhood([], None, db)
        assert entities == []
        assert relations == []
        db.execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_no_relations_returns_empty(self):
        db = _async_db(scalars_return=[])
        seed_ids = [uuid.uuid4()]
        entities, relations = await expand_entity_neighborhood(seed_ids, None, db)
        assert entities == []
        assert relations == []

    @pytest.mark.asyncio
    async def test_returns_neighbour_entities_and_relations(self):
        e_seed = _make_entity("深度学习")
        e_neighbour = _make_entity("神经网络")
        rel = _make_relation(e_seed.id, e_neighbour.id, "基于", 0.9)

        # First execute call returns relations, second returns neighbour entities
        scalars1 = MagicMock()
        scalars1.all.return_value = [rel]
        result1 = MagicMock()
        result1.scalars.return_value = scalars1

        scalars2 = MagicMock()
        scalars2.all.return_value = [e_neighbour]
        result2 = MagicMock()
        result2.scalars.return_value = scalars2

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[result1, result2])

        entities, relations = await expand_entity_neighborhood(
            [e_seed.id], None, db
        )
        assert len(relations) == 1
        assert relations[0].relation_type == "基于"
        assert len(entities) == 1
        assert entities[0].name == "神经网络"


# ---------------------------------------------------------------------------
# format_graph_context
# ---------------------------------------------------------------------------

class TestFormatGraphContext:
    def test_no_entities_no_relations_returns_empty(self):
        result = format_graph_context([], [], [])
        assert result == ""

    def test_only_entities_no_relations(self):
        e = _make_entity("深度学习", "technology", "机器学习范式")
        result = format_graph_context([e], [], [])
        assert GRAPH_CONTEXT_BANNER in result
        assert "深度学习" in result
        assert "technology" in result
        assert "机器学习范式" in result

    def test_entities_and_relations_formatted(self):
        e1 = _make_entity("深度学习", "technology")
        e2 = _make_entity("神经网络", "concept")
        rel = _make_relation(e1.id, e2.id, "基于", 0.9)
        result = format_graph_context([e1], [e2], [rel])
        assert "深度学习" in result
        assert "神经网络" in result
        assert "--基于-->" in result
        assert "0.9" in result

    def test_entity_without_description(self):
        e = _make_entity("概念A", description=None)
        result = format_graph_context([e], [], [])
        assert "概念A" in result
        # No "—" description marker
        assert "— None" not in result

    def test_duplicate_relations_deduplicated(self):
        e1 = _make_entity("A")
        e2 = _make_entity("B")
        rel1 = _make_relation(e1.id, e2.id, "related_to", 0.8)
        rel2 = _make_relation(e1.id, e2.id, "related_to", 0.8)
        result = format_graph_context([e1], [e2], [rel1, rel2])
        assert result.count("--related_to-->") == 1

    def test_seed_and_neighbour_merged_deduplication(self):
        """Same entity in both seed and neighbours should appear only once."""
        e = _make_entity("共同实体")
        result = format_graph_context([e], [e], [])
        assert result.count("共同实体") == 1


# ---------------------------------------------------------------------------
# graph_augmented_context — integration-level (mocked DB)
# ---------------------------------------------------------------------------

class TestGraphAugmentedContext:
    @pytest.mark.asyncio
    async def test_no_matching_entities_returns_empty(self):
        db = _async_db(scalars_return=[])
        result = await graph_augmented_context("some query", None, db)
        assert result == ""

    @pytest.mark.asyncio
    async def test_matching_entities_returns_context_string(self):
        e_seed = _make_entity("深度学习", "technology", "神经网络学习方法")
        e_neighbour = _make_entity("监督学习", "concept")
        rel = _make_relation(e_seed.id, e_neighbour.id, "包含", 0.85)

        scalars_seed = MagicMock()
        scalars_seed.all.return_value = [e_seed]
        result_seed = MagicMock()
        result_seed.scalars.return_value = scalars_seed

        scalars_rel = MagicMock()
        scalars_rel.all.return_value = [rel]
        result_rel = MagicMock()
        result_rel.scalars.return_value = scalars_rel

        scalars_nb = MagicMock()
        scalars_nb.all.return_value = [e_neighbour]
        result_nb = MagicMock()
        result_nb.scalars.return_value = scalars_nb

        db = AsyncMock()
        db.execute = AsyncMock(side_effect=[result_seed, result_rel, result_nb])

        result = await graph_augmented_context("深度学习算法", None, db)
        assert GRAPH_CONTEXT_BANNER in result
        assert "深度学习" in result

    @pytest.mark.asyncio
    async def test_db_exception_returns_empty_string(self):
        """Any DB error must not propagate — returns ""."""
        db = AsyncMock()
        db.execute = AsyncMock(side_effect=RuntimeError("DB connection failed"))
        result = await graph_augmented_context("some query", None, db)
        assert result == ""

    @pytest.mark.asyncio
    async def test_empty_query_returns_empty(self):
        db = AsyncMock()
        result = await graph_augmented_context("", None, db)
        assert result == ""
        db.execute.assert_not_called()
