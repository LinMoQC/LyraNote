from __future__ import annotations

from app.agents.graph.orchestrator import _build_synthesis_packet


def test_build_synthesis_packet_deduplicates_titles_and_limits_context() -> None:
    state = {
        "specialist_outputs": [
            {
                "specialist": "rag",
                "summary": "命中多条知识库片段",
                "chunks": [
                    {"source_title": "Doc A", "content": "A1"},
                    {"source_title": "Doc A", "content": "A2"},
                    {"source_title": "Doc A", "content": "A3"},
                    {"source_title": "Doc B", "content": "B1"},
                ],
            },
            {
                "specialist": "web",
                "summary": "补充了联网资料",
                "web_context": "W" * 5000,
                "chunks": [],
            },
        ]
    }

    packet = _build_synthesis_packet(state)

    assert len(packet["summaries"]) == 2
    assert len(packet["chunks"]) == 3
    assert [chunk["source_title"] for chunk in packet["chunks"]] == ["Doc A", "Doc A", "Doc B"]
    assert len(packet["web_context"]) == 2000
