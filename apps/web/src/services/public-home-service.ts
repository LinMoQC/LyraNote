import { PUBLIC, PUBLIC_HOME } from "@/lib/api-routes";
import { http } from "@/lib/http-client";
import type {
  PublicHomeDraftState,
  PublicNotebook,
  PublicPortraitSnapshot,
  PublicResearchTimelineItem,
  PublicSitePayload,
  PublicSiteProfile,
  PublicSiteStats,
} from "@/types";

type Raw = Record<string, unknown>;

function mapPublicNotebook(raw: Raw): PublicNotebook {
  return {
    id: raw.id as string,
    title: raw.title as string,
    description: (raw.description as string) ?? "",
    summary: (raw.summary_md as string) || undefined,
    coverEmoji: (raw.cover_emoji as string) || undefined,
    coverGradient: (raw.cover_gradient as string) || undefined,
    sourceCount: (raw.source_count as number) ?? 0,
    wordCount: (raw.word_count as number) ?? 0,
    publishedAt: (raw.published_at as string) || undefined,
  };
}

function mapTimelineItem(raw: Raw): PublicResearchTimelineItem {
  return {
    title: raw.title as string,
    summary: raw.summary as string,
    timeLabel: raw.time_label as string,
    sourceNotebookIds: ((raw.source_notebook_ids as string[]) ?? []).map(String),
  };
}

function mapPortraitSnapshot(raw: Raw | null | undefined): PublicPortraitSnapshot | null {
  if (!raw) return null;

  const identity = (raw.identity as Raw | undefined) ?? {};
  const knowledgeMap = (raw.knowledge_map as Raw | undefined) ?? {};
  const researchTrajectory = (raw.research_trajectory as Raw | undefined) ?? {};
  const interactionStyle = (raw.interaction_style as Raw | undefined) ?? {};
  const growthSignals = (raw.growth_signals as Raw | undefined) ?? {};
  const workPatterns = (raw.work_patterns as Raw | undefined) ?? {};

  return {
    identitySummary: (raw.identity_summary as string) ?? "",
    identity: {
      primaryRole: (identity.primary_role as string) ?? "",
      expertiseLevel: (identity.expertise_level as string) ?? "",
      personalityType: (identity.personality_type as string) ?? "",
      confidence: typeof identity.confidence === "number" ? (identity.confidence as number) : undefined,
    },
    knowledgeMap: {
      expertDomains: ((knowledgeMap.expert_domains as string[]) ?? []).map(String),
      learningDomains: ((knowledgeMap.learning_domains as string[]) ?? []).map(String),
      weakDomains: ((knowledgeMap.weak_domains as string[]) ?? []).map(String),
      emergingInterest: ((knowledgeMap.emerging_interest as string[]) ?? []).map(String),
    },
    researchTrajectory: {
      currentFocus: (researchTrajectory.current_focus as string) ?? "",
      recentlyCompleted: ((researchTrajectory.recently_completed as string[]) ?? []).map(String),
      nextLikelyTopics: ((researchTrajectory.next_likely_topics as string[]) ?? []).map(String),
      longTermDirection: (researchTrajectory.long_term_direction as string) ?? "",
    },
    interactionStyle: {
      preferredDepth: (interactionStyle.preferred_depth as string) ?? "",
      answerFormat: (interactionStyle.answer_format as string) ?? "",
      preferredLanguage: (interactionStyle.preferred_language as string) ?? "",
      engagementStyle: (interactionStyle.engagement_style as string) ?? "",
    },
    growthSignals: {
      knowledgeVelocity: (growthSignals.knowledge_velocity as string) ?? "",
      thisPeriodLearned: ((growthSignals.this_period_learned as string[]) ?? []).map(String),
      recurringQuestions: ((growthSignals.recurring_questions as string[]) ?? []).map(String),
      knowledgeGapsDetected: ((growthSignals.knowledge_gaps_detected as string[]) ?? []).map(String),
    },
    workPatterns: {
      prefersDeepFocus:
        typeof workPatterns.prefers_deep_focus === "boolean"
          ? (workPatterns.prefers_deep_focus as boolean)
          : undefined,
      writingToReadingRatio:
        typeof workPatterns.writing_to_reading_ratio === "number"
          ? (workPatterns.writing_to_reading_ratio as number)
          : undefined,
      sessionStyle: (workPatterns.session_style as string) ?? "",
    },
  };
}

function mapProfile(raw: Raw | null | undefined): PublicSiteProfile | null {
  if (!raw) return null;
  return {
    heroSummary: (raw.hero_summary as string) ?? "",
    professionGuess: (raw.profession_guess as string) || undefined,
    interestTags: ((raw.interest_tags as string[]) ?? []).map(String),
    currentResearch: ((raw.current_research as string[]) ?? []).map(String),
    timelineItems: ((raw.timeline_items as Raw[]) ?? []).map(mapTimelineItem),
    topicClusters: ((raw.topic_clusters as string[]) ?? []).map(String),
    featuredNotebookIds: ((raw.featured_notebook_ids as string[]) ?? []).map(String),
    portraitSnapshot: mapPortraitSnapshot((raw.portrait_snapshot as Raw | null) ?? null),
    generatedAt: (raw.generated_at as string) || undefined,
    isAiGenerated: (raw.is_ai_generated as boolean) ?? true,
    avatarUrl: (raw.avatar_url as string | null) ?? null,
  };
}

function mapStats(raw: Raw | null | undefined): PublicSiteStats {
  return {
    notebookCount: (raw?.notebook_count as number) ?? 0,
    wordCount: (raw?.word_count as number) ?? 0,
    sourceCount: (raw?.source_count as number) ?? 0,
    topicCount: (raw?.topic_count as number) ?? 0,
  };
}

function mapDraftState(raw: Raw): PublicHomeDraftState {
  return {
    draftProfile: mapProfile((raw.draft_profile as Raw | null) ?? null),
    approvedProfile: mapProfile((raw.approved_profile as Raw | null) ?? null),
    draftGeneratedAt: (raw.draft_generated_at as string) || undefined,
    approvedAt: (raw.approved_at as string) || undefined,
    notebooks: ((raw.notebooks as Raw[]) ?? []).map(mapPublicNotebook),
    featuredNotebooks: ((raw.featured_notebooks as Raw[]) ?? []).map(mapPublicNotebook),
    stats: mapStats((raw.stats as Raw | null) ?? null),
  };
}

export async function getPublicSite(): Promise<PublicSitePayload> {
  const raw = await http.get<Raw>(PUBLIC.SITE, { skipToast: true });
  return {
    profile: mapProfile((raw.profile as Raw | null) ?? null),
    featuredNotebooks: ((raw.featured_notebooks as Raw[]) ?? []).map(mapPublicNotebook),
    recentNotebooks: ((raw.recent_notebooks as Raw[]) ?? []).map(mapPublicNotebook),
    notebooks: ((raw.notebooks as Raw[]) ?? []).map(mapPublicNotebook),
    stats: mapStats((raw.stats as Raw | null) ?? null),
  };
}

export async function getPublicHomeAdminState(): Promise<PublicHomeDraftState> {
  const raw = await http.get<Raw>(PUBLIC_HOME.BASE);
  return mapDraftState(raw);
}

export async function generatePublicHomeDraft(): Promise<PublicHomeDraftState> {
  const raw = await http.post<Raw>(PUBLIC_HOME.GENERATE, {});
  return mapDraftState(raw);
}

export async function approvePublicHomeDraft(): Promise<PublicHomeDraftState> {
  const raw = await http.post<Raw>(PUBLIC_HOME.APPROVE, {});
  return mapDraftState(raw);
}

export async function backfillPublicHomePortrait(): Promise<PublicHomeDraftState> {
  const raw = await http.post<Raw>(PUBLIC_HOME.BACKFILL_PORTRAIT, {});
  return mapDraftState(raw);
}

export async function discardPublicHomeDraft(): Promise<PublicHomeDraftState> {
  const raw = await http.post<Raw>(PUBLIC_HOME.DISCARD, {});
  return mapDraftState(raw);
}
