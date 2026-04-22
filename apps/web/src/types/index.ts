/**
 * @file 全局类型定义
 * @description 前端核心业务实体的 TypeScript 类型定义。
 *              通用类型从 @lyranote/types 导入，web 专有类型在此扩展或本地定义。
 */

import type {
  Source as SharedSource,
  PublicNotebook,
} from "@lyranote/types"

// ── Re-export shared types ────────────────────────────────────────────────────

export type {
  CitationData,
  AgentStep,
  MindMapNode,
  MindMapData,
  DiagramData,
  MCPResultData,
  Message,
  Artifact,
  UserProfile,
  PublicNotebook,
  PublicNote,
  PublicNotebookDetail,
} from "@lyranote/types"

// ── Web-extended shared types ─────────────────────────────────────────────────

export type { Notebook } from "@lyranote/types"

/** 知识来源（web 端含 updatedAt / metadata） */
export interface Source extends SharedSource {
  updatedAt?: string
  metadata?: Record<string, unknown>
}

// ── Web-only public site types ────────────────────────────────────────────────

export interface PublicResearchTimelineItem {
  title: string
  summary: string
  timeLabel: string
  sourceNotebookIds: string[]
}

export interface PublicPortraitIdentity {
  primaryRole: string
  expertiseLevel: string
  personalityType: string
  confidence?: number
}

export interface PublicPortraitKnowledgeMap {
  expertDomains: string[]
  learningDomains: string[]
  weakDomains: string[]
  emergingInterest: string[]
}

export interface PublicPortraitResearchTrajectory {
  currentFocus: string
  recentlyCompleted: string[]
  nextLikelyTopics: string[]
  longTermDirection: string
}

export interface PublicPortraitInteractionStyle {
  preferredDepth: string
  answerFormat: string
  preferredLanguage: string
  engagementStyle: string
}

export interface PublicPortraitGrowthSignals {
  knowledgeVelocity: string
  thisPeriodLearned: string[]
  recurringQuestions: string[]
  knowledgeGapsDetected: string[]
}

export interface PublicPortraitWorkPatterns {
  prefersDeepFocus?: boolean
  writingToReadingRatio?: number
  sessionStyle: string
}

export interface PublicPortraitSnapshot {
  identitySummary: string
  identity: PublicPortraitIdentity
  knowledgeMap: PublicPortraitKnowledgeMap
  researchTrajectory: PublicPortraitResearchTrajectory
  interactionStyle: PublicPortraitInteractionStyle
  growthSignals: PublicPortraitGrowthSignals
  workPatterns: PublicPortraitWorkPatterns
}

export interface PublicSiteProfile {
  heroSummary: string
  professionGuess?: string
  interestTags: string[]
  currentResearch: string[]
  timelineItems: PublicResearchTimelineItem[]
  topicClusters: string[]
  featuredNotebookIds: string[]
  portraitSnapshot?: PublicPortraitSnapshot | null
  generatedAt?: string
  isAiGenerated: boolean
  /** AI-generated anime avatar URL stored in object storage. Null when not configured or generation failed. */
  avatarUrl?: string | null
}

export interface PublicSiteStats {
  notebookCount: number
  wordCount: number
  sourceCount: number
  topicCount: number
}

export interface PublicSitePayload {
  profile: PublicSiteProfile | null
  featuredNotebooks: PublicNotebook[]
  recentNotebooks: PublicNotebook[]
  notebooks: PublicNotebook[]
  stats: PublicSiteStats
}

export interface PublicHomeDraftState {
  draftProfile: PublicSiteProfile | null
  approvedProfile: PublicSiteProfile | null
  draftGeneratedAt?: string
  approvedAt?: string
  notebooks: PublicNotebook[]
  featuredNotebooks: PublicNotebook[]
  stats: PublicSiteStats
}
