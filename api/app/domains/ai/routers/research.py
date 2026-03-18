"""Deep research streaming endpoint."""

import json

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.dependencies import CurrentUser, DbDep
from app.domains.ai.schemas import DeepResearchRequest
from app.config import settings
from app.providers.llm import get_client

router = APIRouter()


@router.post("/ai/deep-research")
async def deep_research_stream(
    body: DeepResearchRequest,
    current_user: CurrentUser,
    db: DbDep,
):
    """
    LangGraph-powered deep research pipeline.
    plan_node -> parallel search_node x N -> synthesis_node -> deliverable_node
    """
    client = get_client()

    import logging as _logging
    from app.agents.memory import build_memory_context
    try:
        user_memories = await build_memory_context(current_user.id, body.query, db, top_k=5)
    except Exception as _exc:
        _logging.getLogger(__name__).warning("Memory context load failed: %s", _exc)
        user_memories = []

    async def generate():
        from app.agents.research.deep_research import create_research_graph

        graph = create_research_graph(
            db=db,
            client=client,
            tavily_api_key=settings.tavily_api_key or None,
        )

        input_state = {
            "query": body.query,
            "notebook_id": body.notebook_id,
            "user_id": str(current_user.id),
            "model": settings.llm_model,
            "tavily_api_key": settings.tavily_api_key or None,
            "user_memories": user_memories,
            "research_goal": "",
            "evaluation_criteria": [],
            "search_matrix": {},
            "learnings": [],
            "full_report": "",
            "deliverable": None,
        }

        try:
            async for event in graph.astream_events(input_state, version="v2"):
                if event["event"] == "on_custom_event":
                    sse = {"type": event["name"], "data": event["data"]}
                    yield f"data: {json.dumps(sse, ensure_ascii=False)}\n\n"
        except Exception as exc:
            error_event = {"type": "error", "data": {"message": str(exc)}}
            yield f"data: {json.dumps(error_event, ensure_ascii=False)}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
