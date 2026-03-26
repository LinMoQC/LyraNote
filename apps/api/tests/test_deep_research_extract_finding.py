"""
Tests for app/agents/deep_research.py — specifically the _extract_finding()
function added in this PR.

deep_research.py has heavy module-level imports (langchain_core, langgraph)
that are not installed in the test environment. We isolate _extract_finding()
by importing it via importlib after patching sys.modules with stubs.
"""

from __future__ import annotations

import json
import sys
import types
import importlib
import pytest


# ── Stub out heavy dependencies so deep_research.py can be imported ───────────

def _make_stub_modules() -> None:
    """Create minimal stub modules to satisfy deep_research.py's top-level imports."""
    stubs = [
        "langchain_core",
        "langchain_core.callbacks",
        "langchain_core.callbacks.manager",
        "langgraph",
        "langgraph.graph",
        "langgraph.types",
    ]
    for name in stubs:
        if name not in sys.modules:
            mod = types.ModuleType(name)
            sys.modules[name] = mod

    # Provide the specific attributes used at module level
    cb_manager = sys.modules["langchain_core.callbacks.manager"]
    if not hasattr(cb_manager, "adispatch_custom_event"):
        cb_manager.adispatch_custom_event = None  # type: ignore[attr-defined]

    lg_graph = sys.modules["langgraph.graph"]
    if not hasattr(lg_graph, "END"):
        lg_graph.END = "END"  # type: ignore[attr-defined]
    if not hasattr(lg_graph, "START"):
        lg_graph.START = "START"  # type: ignore[attr-defined]
    if not hasattr(lg_graph, "StateGraph"):
        class _FakeStateGraph:
            def __init__(self, *a, **kw): pass
        lg_graph.StateGraph = _FakeStateGraph  # type: ignore[attr-defined]

    lg_types = sys.modules["langgraph.types"]
    if not hasattr(lg_types, "Send"):
        lg_types.Send = object  # type: ignore[attr-defined]


_make_stub_modules()

# Force re-import if already cached without stubs
if "app.agents.research.deep_research" in sys.modules:
    del sys.modules["app.agents.research.deep_research"]

from app.agents.research.deep_research import _extract_finding, LEARNING_MAX_CHARS  # noqa: E402


# ── Tests for _extract_finding ─────────────────────────────────────────────────

class TestExtractFindingValidJSON:
    """Strategy 1: json.loads on the whole string succeeds."""

    def test_clean_json_finding_and_counterpoint(self):
        raw = json.dumps({"finding": "AI is transformative", "counterpoint": "It has risks"})
        finding, counterpoint = _extract_finding(raw)
        assert finding == "AI is transformative"
        assert counterpoint == "It has risks"

    def test_clean_json_finding_only(self):
        raw = json.dumps({"finding": "Deep learning excels at pattern recognition"})
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Deep learning excels at pattern recognition"
        assert counterpoint == ""

    def test_clean_json_empty_counterpoint(self):
        raw = json.dumps({"finding": "Quantum computing is promising", "counterpoint": ""})
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Quantum computing is promising"
        assert counterpoint == ""

    def test_json_with_extra_fields_ignored(self):
        raw = json.dumps({
            "finding": "Neural networks are universal approximators",
            "counterpoint": "They require lots of data",
            "source": "some paper",
            "confidence": 0.9,
        })
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Neural networks are universal approximators"
        assert counterpoint == "They require lots of data"

    def test_json_finding_is_non_string_converted(self):
        """Non-string finding values are converted to str."""
        raw = json.dumps({"finding": 42, "counterpoint": True})
        finding, counterpoint = _extract_finding(raw)
        assert finding == "42"
        assert counterpoint == "True"

    def test_json_missing_finding_falls_back_to_raw(self):
        """If JSON has no 'finding' key, raw[:LEARNING_MAX_CHARS] is used."""
        raw = json.dumps({"result": "some result", "counterpoint": "a point"})
        finding, counterpoint = _extract_finding(raw)
        assert finding == raw[:LEARNING_MAX_CHARS]
        assert counterpoint == "a point"

    def test_json_with_whitespace_around_it(self):
        raw = "   " + json.dumps({"finding": "Test finding", "counterpoint": "Test cp"}) + "\n"
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Test finding"
        assert counterpoint == "Test cp"


class TestExtractFindingNestedJSON:
    """Strategy 2: json.loads on the first {...} extracted by regex."""

    def test_json_embedded_in_preamble(self):
        """JSON object embedded in surrounding text."""
        inner = json.dumps({"finding": "Embeddings capture semantics", "counterpoint": "Limitations exist"})
        raw = f"Here is the result:\n{inner}\nEnd of result."
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Embeddings capture semantics"
        assert counterpoint == "Limitations exist"

    def test_json_after_markdown_code_fence_stripped(self):
        """Code fence stripped by _strip_fences before calling _extract_finding."""
        # _extract_finding itself doesn't strip fences; test raw JSON extraction
        raw = '{"finding": "RAG improves accuracy", "counterpoint": "May hallucinate"}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "RAG improves accuracy"
        assert counterpoint == "May hallucinate"


class TestExtractFindingRegexFallback:
    """Strategy 3: regex extraction of 'finding' value from malformed JSON."""

    def test_malformed_json_with_finding_key(self):
        """JSON with a trailing comma or other syntax error → regex fallback."""
        raw = '{"finding": "This is extracted by regex", "counterpoint": "A counterpoint",}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "This is extracted by regex"
        assert counterpoint == "A counterpoint"

    def test_finding_without_counterpoint_in_malformed_json(self):
        raw = '{"finding": "Only a finding here",}'
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Only a finding here"
        assert counterpoint == ""

    def test_finding_with_escaped_quotes(self):
        """Escaped quotes inside the finding value should be handled."""
        raw = r'{"finding": "He said \"hello\" to the model",}'
        finding, counterpoint = _extract_finding(raw)
        assert "hello" in finding

    def test_finding_multiline_value(self):
        """Multi-line content in the finding value."""
        raw = '{"finding": "Line one\\nLine two",}'
        finding, counterpoint = _extract_finding(raw)
        assert "Line one" in finding


class TestExtractFindingRawTextFallback:
    """Strategy 4: raw text fallback, stripping leading JSON syntax."""

    def test_plain_text_no_json(self):
        raw = "This is just plain text with no JSON structure at all."
        finding, counterpoint = _extract_finding(raw)
        assert finding == raw[:LEARNING_MAX_CHARS]
        assert counterpoint == ""

    def test_raw_text_truncated_to_max_chars(self):
        raw = "x" * (LEARNING_MAX_CHARS + 50)
        finding, counterpoint = _extract_finding(raw)
        assert len(finding) == LEARNING_MAX_CHARS
        assert counterpoint == ""

    def test_raw_text_under_max_chars_not_truncated(self):
        raw = "Short text"
        finding, counterpoint = _extract_finding(raw)
        assert finding == "Short text"

    def test_text_with_leading_brace_stripped(self):
        """Text starting with '{' but not valid JSON is cleaned up."""
        raw = '{"finding" broken stuff no closing brace ever'
        finding, counterpoint = _extract_finding(raw)
        # The fallback strips leading `{" \t\n` then removeprefix "finding"
        # then strips `: " \t\n` — remaining is "broken stuff no closing brace ever"
        assert counterpoint == ""
        # Finding should not start with `{"finding`
        assert not finding.startswith('{"finding')

    def test_empty_string_returns_empty_finding(self):
        finding, counterpoint = _extract_finding("")
        assert finding == ""
        assert counterpoint == ""


class TestExtractFindingEdgeCases:
    def test_only_braces_not_valid_json(self):
        raw = "{}"
        finding, counterpoint = _extract_finding(raw)
        # {} is valid JSON → finding = raw[:LEARNING_MAX_CHARS] (no "finding" key)
        assert counterpoint == ""

    def test_finding_value_at_exact_max_chars(self):
        """Finding value exactly at LEARNING_MAX_CHARS is not truncated."""
        value = "x" * LEARNING_MAX_CHARS
        raw = json.dumps({"finding": value})
        finding, counterpoint = _extract_finding(raw)
        assert finding == value

    def test_finding_value_over_max_chars_in_valid_json(self):
        """Valid JSON: finding value is returned as-is (truncation is NOT applied to JSON path)."""
        value = "x" * (LEARNING_MAX_CHARS + 100)
        raw = json.dumps({"finding": value})
        finding, counterpoint = _extract_finding(raw)
        # The JSON path returns str(parsed.get("finding", ...)) — no truncation
        assert finding == value

    def test_counterpoint_only_no_finding(self):
        """No finding key → uses raw[:LEARNING_MAX_CHARS]."""
        raw = json.dumps({"counterpoint": "This is the counterpoint"})
        finding, counterpoint = _extract_finding(raw)
        assert counterpoint == "This is the counterpoint"
        assert finding == raw[:LEARNING_MAX_CHARS]

    def test_returns_tuple_of_two_strings(self):
        finding, counterpoint = _extract_finding('{"finding": "test"}')
        assert isinstance(finding, str)
        assert isinstance(counterpoint, str)

    def test_unicode_content_handled(self):
        raw = json.dumps({"finding": "深度学习突破", "counterpoint": "需要大量数据"})
        finding, counterpoint = _extract_finding(raw)
        assert finding == "深度学习突破"
        assert counterpoint == "需要大量数据"