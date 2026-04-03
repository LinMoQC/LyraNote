from app.agents.research.task_manager import collect_web_sources


def test_collect_web_sources_dedupes_web_citations() -> None:
    result = collect_web_sources([
        {
            "sub_question": "问题一",
            "citations": [
                {"type": "web", "title": "A", "url": "https://example.com/a", "excerpt": "alpha"},
                {"type": "internal", "title": "B", "url": "internal://b"},
            ],
        },
        {
            "sub_question": "问题二",
            "citations": [
                {"type": "web", "title": "A2", "url": "https://example.com/a", "excerpt": "duplicate"},
                {"type": "web", "title": "C", "url": "https://example.com/c", "excerpt": "charlie"},
            ],
        },
    ])

    assert result == [
        {
            "title": "A",
            "url": "https://example.com/a",
            "excerpt": "alpha",
            "query": "问题一",
        },
        {
            "title": "C",
            "url": "https://example.com/c",
            "excerpt": "charlie",
            "query": "问题二",
        },
    ]
