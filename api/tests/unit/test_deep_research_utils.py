"""
Unit tests for pure utility functions in deep_research.py.

No DB, no HTTP — these tests run in milliseconds.

Covers:
  _strip_fences()             — remove markdown code fences from LLM output
  _try_json_dict()            — parse JSON, unwrap single-element arrays
  grade_evidence()            — per-learning citation grader (pure rules)
  compute_evidence_strength() — aggregate evidence strength across all learnings
"""
from __future__ import annotations

import os

os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("JWT_SECRET", "test-secret-key-for-pytest")
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_LOCAL_PATH", "/tmp/lyranote-test-storage")
os.environ.setdefault("OPENAI_API_KEY", "sk-test")
os.environ.setdefault("DEBUG", "false")

from app.agents.research.deep_research import (
    _strip_fences,
    _try_json_dict,
    compute_evidence_strength,
    grade_evidence,
)


# ── _strip_fences ─────────────────────────────────────────────────────────────

class TestStripFences:
    def test_json_fence_removed(self):
        raw = '```json\n{"key": "value"}\n```'
        assert _strip_fences(raw) == '{"key": "value"}'

    def test_plain_fence_no_json_prefix(self):
        raw = '```\n{"key": "value"}\n```'
        result = _strip_fences(raw)
        assert '{"key": "value"}' in result

    def test_no_fence_returns_unchanged(self):
        raw = "plain text without fences"
        assert _strip_fences(raw) == raw

    def test_empty_string_returns_empty(self):
        assert _strip_fences("") == ""

    def test_strips_surrounding_whitespace(self):
        raw = "```json\n  {}\n```"
        assert _strip_fences(raw).strip() == "{}"

    def test_only_opening_fence_no_crash(self):
        """Malformed input with only an opening fence should not raise."""
        raw = "```json\nsome content"
        result = _strip_fences(raw)
        assert isinstance(result, str)

    def test_non_json_fence_label_preserved(self):
        """A ``` fence without 'json' label — json prefix not stripped."""
        raw = "```python\nprint('hello')\n```"
        result = _strip_fences(raw)
        # Should not crash; content should contain the code
        assert "print" in result


# ── _try_json_dict ────────────────────────────────────────────────────────────

class TestTryJsonDict:
    def test_valid_object_returns_dict(self):
        result = _try_json_dict('{"a": 1, "b": "two"}')
        assert result == {"a": 1, "b": "two"}

    def test_array_with_single_dict_unwrapped(self):
        result = _try_json_dict('[{"finding": "x", "counterpoint": "y"}]')
        assert result == {"finding": "x", "counterpoint": "y"}

    def test_array_with_multiple_dicts_returns_first(self):
        result = _try_json_dict('[{"n": 1}, {"n": 2}]')
        assert result == {"n": 1}

    def test_empty_array_returns_none(self):
        assert _try_json_dict("[]") is None

    def test_invalid_json_returns_none(self):
        assert _try_json_dict("not json at all") is None

    def test_json_string_scalar_returns_none(self):
        assert _try_json_dict('"just a string"') is None

    def test_json_number_returns_none(self):
        assert _try_json_dict("42") is None

    def test_json_boolean_returns_none(self):
        assert _try_json_dict("true") is None

    def test_empty_object_returns_empty_dict(self):
        result = _try_json_dict("{}")
        assert result == {}

    def test_nested_object_returned_as_is(self):
        result = _try_json_dict('{"outer": {"inner": "val"}}')
        assert result["outer"] == {"inner": "val"}


# ── grade_evidence ────────────────────────────────────────────────────────────

class TestGradeEvidence:
    def test_empty_citations_is_weak(self):
        assert grade_evidence([]) == "weak"

    def test_single_internal_citation_is_medium(self):
        citations = [{"type": "internal", "chunk_id": "abc"}]
        assert grade_evidence(citations) == "medium"

    def test_single_web_citation_is_medium(self):
        citations = [{"type": "web", "url": "https://example.com"}]
        assert grade_evidence(citations) == "medium"

    def test_two_web_citations_is_medium(self):
        citations = [{"type": "web"}, {"type": "web"}]
        assert grade_evidence(citations) == "medium"

    def test_three_web_only_no_internal_is_medium(self):
        """3+ citations but missing internal type should not be strong."""
        citations = [{"type": "web"}, {"type": "web"}, {"type": "web"}]
        assert grade_evidence(citations) == "medium"

    def test_three_mixed_web_and_internal_is_strong(self):
        citations = [{"type": "web"}, {"type": "web"}, {"type": "internal"}]
        assert grade_evidence(citations) == "strong"

    def test_four_mixed_is_strong(self):
        citations = [
            {"type": "web"}, {"type": "web"},
            {"type": "internal"}, {"type": "internal"},
        ]
        assert grade_evidence(citations) == "strong"

    def test_one_web_one_internal_two_total_is_medium(self):
        """n=2 → medium (requires n>=3 AND both types for strong)."""
        citations = [{"type": "web"}, {"type": "internal"}]
        assert grade_evidence(citations) == "medium"

    def test_return_type_is_string(self):
        for citations in [[], [{"type": "web"}], [{"type": "internal"}, {"type": "web"}, {"type": "internal"}]]:
            result = grade_evidence(citations)
            assert isinstance(result, str)
            assert result in ("weak", "medium", "strong")


# ── compute_evidence_strength ─────────────────────────────────────────────────

class TestComputeEvidenceStrength:
    def test_empty_learnings_is_low(self):
        assert compute_evidence_strength([]) == "low"

    def test_two_total_citations_is_low(self):
        learnings = [{"citations": [{"type": "web"}, {"type": "web"}]}]
        assert compute_evidence_strength(learnings) == "low"

    def test_three_citations_web_only_is_medium(self):
        learnings = [{"citations": [{"type": "web"}, {"type": "web"}, {"type": "web"}]}]
        assert compute_evidence_strength(learnings) == "medium"

    def test_three_citations_across_multiple_learnings_is_medium(self):
        learnings = [
            {"citations": [{"type": "web"}]},
            {"citations": [{"type": "web"}, {"type": "web"}]},
        ]
        assert compute_evidence_strength(learnings) == "medium"

    def test_six_citations_web_and_internal_is_high(self):
        learnings = [
            {"citations": [{"type": "web"}, {"type": "web"}, {"type": "internal"}]},
            {"citations": [{"type": "web"}, {"type": "internal"}, {"type": "internal"}]},
        ]
        assert compute_evidence_strength(learnings) == "high"

    def test_six_citations_web_only_is_medium(self):
        """6+ citations but no internal type should not reach 'high'."""
        learnings = [{"citations": [{"type": "web"}] * 6}]
        assert compute_evidence_strength(learnings) == "medium"

    def test_six_citations_internal_only_is_medium(self):
        """6+ citations but no web type should not reach 'high'."""
        learnings = [{"citations": [{"type": "internal"}] * 6}]
        assert compute_evidence_strength(learnings) == "medium"

    def test_missing_citations_key_treated_as_empty(self):
        """Learning dicts without 'citations' key should not crash."""
        learnings = [{"content": "something"}]
        result = compute_evidence_strength(learnings)
        assert result in ("low", "medium", "high")

    def test_return_type_is_string(self):
        for learnings in [[], [{"citations": []}], [{"citations": [{"type": "web"}] * 6 + [{"type": "internal"}]}]]:
            result = compute_evidence_strength(learnings)
            assert isinstance(result, str)
            assert result in ("low", "medium", "high")
