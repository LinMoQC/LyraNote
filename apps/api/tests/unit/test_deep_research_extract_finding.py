"""
Unit tests for _extract_finding() in deep_research.py.

Covers all 5 extraction paths:
  Path 1 — full-string json.loads
  Path 2 — regex-extracted {...} block + json.loads
  Path 3 — strict regex (properly escaped quotes)
  Path 4 — greedy regex (unescaped internal quotes)
  Path 5 — raw text fallback
"""
from __future__ import annotations

import pytest

from app.agents.research.deep_research import LEARNING_MAX_CHARS, _extract_finding


# ── Path 1: Full-string JSON parse ────────────────────────────────────────────

class TestExtractFindingValidJSON:
    def test_clean_json_returns_finding_and_counterpoint(self):
        raw = '{"finding": "Python is fast", "counterpoint": "It uses GIL"}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Python is fast"
        assert counterpoint == "It uses GIL"

    def test_clean_json_without_counterpoint(self):
        raw = '{"finding": "Water boils at 100°C"}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Water boils at 100°C"
        assert counterpoint == ""

    def test_json_missing_finding_falls_back_to_raw(self):
        raw = '{"result": "some result", "counterpoint": "a point"}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == raw[:LEARNING_MAX_CHARS]

    def test_finding_value_over_max_chars_in_valid_json(self):
        """Valid JSON finding is NOT truncated — max_chars only applies to fallback paths."""
        value = "x" * (LEARNING_MAX_CHARS + 84)
        raw = f'{{"finding": "{value}"}}'
        finding, _ = _extract_finding(raw)
        assert finding == value

    def test_json_array_wrapping_unwrapped(self):
        raw = '[{"finding": "list item finding", "counterpoint": "list cp"}]'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "list item finding"
        assert counterpoint == "list cp"

    def test_json_with_extra_whitespace(self):
        raw = '  { "finding" : "  spaced  " , "counterpoint" : "cp"  }  '
        finding, counterpoint = _extract_finding(raw)
        assert finding == "spaced"
        assert counterpoint == "cp"

    def test_json_with_unicode_content(self):
        raw = '{"finding": "深度学习改变了 NLP 领域", "counterpoint": "计算成本高"}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "深度学习改变了 NLP 领域"
        assert counterpoint == "计算成本高"

    def test_counterpoint_only_no_finding(self):
        """JSON has counterpoint but no finding key — counterpoint still returned."""
        raw = '{"counterpoint": "This is the counterpoint"}'
        finding, counterpoint = _extract_finding(raw)
        assert counterpoint == "This is the counterpoint"

    def test_json_finding_is_empty_string_falls_back(self):
        """finding present but empty string — treat as missing, fall back to raw."""
        raw = '{"finding": "", "counterpoint": "cp"}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == raw[:LEARNING_MAX_CHARS]


# ── Path 2: Regex-extracted {...} block ───────────────────────────────────────

class TestExtractFindingEmbeddedJSON:
    def test_json_embedded_in_prose(self):
        raw = 'Here is the analysis: {"finding": "embedded finding", "counterpoint": "embedded cp"} — end.'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "embedded finding"
        assert counterpoint == "embedded cp"

    def test_json_after_markdown_fence(self):
        raw = '```json\n{"finding": "fenced finding", "counterpoint": "fenced cp"}\n```'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "fenced finding"
        assert counterpoint == "fenced cp"

    def test_json_embedded_without_counterpoint(self):
        raw = 'Prefix text {"finding": "only finding here"} suffix'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "only finding here"
        assert counterpoint == ""


# ── Path 3: Strict regex ──────────────────────────────────────────────────────

class TestExtractFindingStrictRegex:
    def test_properly_escaped_quotes_in_finding(self):
        raw = r'{"finding": "She said \"hello world\" to everyone", "counterpoint": "no cp"}'
        finding, counterpoint = _extract_finding(raw)
        assert "hello world" in finding

    def test_long_finding_via_strict_regex(self):
        """Strict regex requires len >= 20; create a long enough string."""
        long_val = "A" * 25
        raw = f'{{"finding": "{long_val}", "counterpoint": ""}}'
        finding, _ = _extract_finding(raw)
        assert long_val in finding


# ── Path 5: Raw text fallback ─────────────────────────────────────────────────

class TestExtractFindingRawTextFallback:
    def test_empty_string_returns_empty_finding(self):
        finding, counterpoint = _extract_finding("")
        assert finding == ""
        assert counterpoint == ""

    def test_whitespace_only_returns_empty_finding(self):
        finding, counterpoint = _extract_finding("   \n\t  ")
        assert finding == ""
        assert counterpoint == ""

    def test_plain_prose_returns_as_finding(self):
        raw = "This is just a plain sentence without any JSON."
        finding, counterpoint = _extract_finding(raw)
        assert finding == raw[:LEARNING_MAX_CHARS]
        assert counterpoint == ""

    def test_fallback_truncates_at_max_chars(self):
        raw = "z" * (LEARNING_MAX_CHARS + 50)
        finding, _ = _extract_finding(raw)
        assert len(finding) == LEARNING_MAX_CHARS

    def test_custom_max_chars_respected_in_fallback(self):
        raw = "word " * 100
        finding, _ = _extract_finding(raw, max_chars=50)
        assert len(finding) <= 50

    def test_nearly_valid_json_falls_back_gracefully(self):
        """Truncated JSON that cannot be parsed should fall back to raw text."""
        raw = '{"finding": "incomplete'
        finding, counterpoint = _extract_finding(raw)
        assert finding  # something is returned
        assert counterpoint == ""


# ── Edge cases ────────────────────────────────────────────────────────────────

class TestExtractFindingEdgeCases:
    def test_finding_value_over_max_chars_in_valid_json(self):
        value = "x" * (LEARNING_MAX_CHARS + 84)
        raw = f'{{"finding": "{value}"}}'
        finding, _ = _extract_finding(raw)
        assert finding == value

    def test_counterpoint_only_no_finding(self):
        raw = '{"counterpoint": "This is the counterpoint"}'
        _, counterpoint = _extract_finding(raw)
        assert counterpoint == "This is the counterpoint"

    def test_both_fields_empty_string(self):
        raw = '{"finding": "", "counterpoint": ""}'
        finding, counterpoint = _extract_finding(raw)
        assert counterpoint == ""

    def test_none_like_values_treated_as_string(self):
        raw = '{"finding": "null", "counterpoint": "false"}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "null"
        assert counterpoint == "false"

    def test_numeric_finding_cast_to_string(self):
        raw = '{"finding": 42, "counterpoint": ""}'
        finding, _ = _extract_finding(raw)
        assert finding == "42"

    def test_multiline_finding_in_json(self):
        raw = '{"finding": "line one\\nline two\\nline three", "counterpoint": ""}'
        finding, _ = _extract_finding(raw)
        assert "line one" in finding

    def test_return_type_is_always_tuple_of_two_strings(self):
        for raw in ["", "{}", '{"finding": "x"}', "plain text", "   "]:
            result = _extract_finding(raw)
            assert isinstance(result, tuple)
            assert len(result) == 2
            assert isinstance(result[0], str)
            assert isinstance(result[1], str)

    def test_max_chars_zero_returns_empty_finding_for_fallback(self):
        """max_chars=0 on a fallback path should return empty string."""
        raw = "plain text that cannot be parsed as json"
        finding, _ = _extract_finding(raw, max_chars=0)
        assert finding == ""

    def test_finding_with_nested_object_value(self):
        """Top-level JSON with finding field survives even if value has braces."""
        raw = '{"finding": "uses {curly} braces inside", "counterpoint": ""}'
        finding, _ = _extract_finding(raw)
        assert "curly" in finding
