"""AI domain — aggregated router.

Previously a 730+ line God File, now split into focused sub-routers:
  - suggestions: AI suggestions, context greetings, source suggestions
  - research: deep research streaming pipeline
  - writing: text polish, writing context
  - knowledge: cross-notebook knowledge discovery
  - insights: proactive insights CRUD
"""

from fastapi import APIRouter

from app.domains.ai.routers import suggestions, research, writing, knowledge, insights

router = APIRouter(tags=["ai"])

router.include_router(suggestions.router)
router.include_router(research.router)
router.include_router(writing.router)
router.include_router(knowledge.router)
router.include_router(insights.router)
