import pytest

from app.agents.writing.ghost_text import rewrite_selection


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("action", "expected_fragment"),
    [
        ("polish", "润色"),
        ("proofread", "校对"),
        ("reformat", "重新整理"),
        ("shorten", "精简"),
        ("expand", "扩写"),
    ],
)
async def test_rewrite_selection_uses_expected_prompt(monkeypatch: pytest.MonkeyPatch, action: str, expected_fragment: str):
    captured: dict[str, object] = {}

    async def fake_chat(messages: list[dict[str, str]], temperature: float):
        captured["messages"] = messages
        captured["temperature"] = temperature
        return "rewritten"

    monkeypatch.setattr("app.providers.llm.chat", fake_chat)

    result = await rewrite_selection("原始文本", action, "笔记背景")

    assert result == "rewritten"
    messages = captured["messages"]
    assert isinstance(messages, list)
    assert expected_fragment in messages[0]["content"]
    assert "原始文本" in messages[1]["content"]
    assert "笔记背景" in messages[1]["content"]
    assert captured["temperature"] == 0.6
