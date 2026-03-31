from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.domains.public.schemas import PublicNotebookOut


class PublicResearchTimelineItemOut(BaseModel):
    title: str
    summary: str
    time_label: str
    source_notebook_ids: list[UUID]


class PublicPortraitIdentityOut(BaseModel):
    primary_role: str = ""
    expertise_level: str = ""
    personality_type: str = ""
    confidence: float | None = None


class PublicPortraitKnowledgeMapOut(BaseModel):
    expert_domains: list[str] = []
    learning_domains: list[str] = []
    weak_domains: list[str] = []
    emerging_interest: list[str] = []


class PublicPortraitResearchTrajectoryOut(BaseModel):
    current_focus: str = ""
    recently_completed: list[str] = []
    next_likely_topics: list[str] = []
    long_term_direction: str = ""


class PublicPortraitInteractionStyleOut(BaseModel):
    preferred_depth: str = ""
    answer_format: str = ""
    preferred_language: str = ""
    engagement_style: str = ""


class PublicPortraitGrowthSignalsOut(BaseModel):
    knowledge_velocity: str = ""
    this_period_learned: list[str] = []
    recurring_questions: list[str] = []
    knowledge_gaps_detected: list[str] = []


class PublicPortraitWorkPatternsOut(BaseModel):
    prefers_deep_focus: bool | None = None
    writing_to_reading_ratio: float | None = None
    session_style: str = ""


class PublicPortraitSnapshotOut(BaseModel):
    identity_summary: str = ""
    identity: PublicPortraitIdentityOut = PublicPortraitIdentityOut()
    knowledge_map: PublicPortraitKnowledgeMapOut = PublicPortraitKnowledgeMapOut()
    research_trajectory: PublicPortraitResearchTrajectoryOut = PublicPortraitResearchTrajectoryOut()
    interaction_style: PublicPortraitInteractionStyleOut = PublicPortraitInteractionStyleOut()
    growth_signals: PublicPortraitGrowthSignalsOut = PublicPortraitGrowthSignalsOut()
    work_patterns: PublicPortraitWorkPatternsOut = PublicPortraitWorkPatternsOut()


class PublicSiteProfileOut(BaseModel):
    hero_summary: str
    profession_guess: str | None = None
    interest_tags: list[str] = []
    current_research: list[str] = []
    timeline_items: list[PublicResearchTimelineItemOut] = []
    topic_clusters: list[str] = []
    featured_notebook_ids: list[UUID] = []
    portrait_snapshot: PublicPortraitSnapshotOut | None = None
    generated_at: datetime | None = None
    is_ai_generated: bool = True
    # AI-generated anime avatar stored in object storage.
    # None when image_gen_api_key is not configured or generation failed.
    avatar_url: str | None = None


class PublicSiteStatsOut(BaseModel):
    notebook_count: int = 0
    word_count: int = 0
    source_count: int = 0
    topic_count: int = 0


class PublicSiteOut(BaseModel):
    profile: PublicSiteProfileOut | None = None
    featured_notebooks: list[PublicNotebookOut] = []
    recent_notebooks: list[PublicNotebookOut] = []
    notebooks: list[PublicNotebookOut] = []
    stats: PublicSiteStatsOut


class PublicHomeAdminStateOut(BaseModel):
    draft_profile: PublicSiteProfileOut | None = None
    approved_profile: PublicSiteProfileOut | None = None
    draft_generated_at: datetime | None = None
    approved_at: datetime | None = None
    notebooks: list[PublicNotebookOut] = []
    featured_notebooks: list[PublicNotebookOut] = []
    stats: PublicSiteStatsOut
