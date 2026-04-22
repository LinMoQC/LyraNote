from __future__ import annotations

from app.domains.note.router import _compute_word_count


def test_compute_word_count_counts_chinese_english_and_numbers() -> None:
    assert _compute_word_count("你好 LyraNote 2026") == 4


def test_compute_word_count_returns_zero_for_empty_text() -> None:
    assert _compute_word_count(None) == 0
    assert _compute_word_count("") == 0
