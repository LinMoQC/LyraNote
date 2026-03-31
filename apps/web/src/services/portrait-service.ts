/**
 * @file 用户画像服务
 * @description 与后端 /portrait 接口交互，获取 Lyra 对用户的长期认知画像。
 */

import { http } from "@/lib/http-client";
import { PORTRAIT } from "@/lib/api-routes";

export interface PortraitIdentity {
  primary_role: string;
  expertise_level: string;
  personality_type: string;
  confidence: number;
}

export interface KnowledgeMap {
  expert_domains: string[];
  learning_domains: string[];
  weak_domains: string[];
  emerging_interest: string[];
}

export interface ResearchTrajectory {
  current_focus: string;
  recently_completed: string[];
  next_likely_topics: string[];
  long_term_direction: string;
}

export interface InteractionStyle {
  preferred_depth: string;
  answer_format: string;
  preferred_language: string;
  engagement_style: string;
}

export interface GrowthSignals {
  knowledge_velocity: "low" | "medium" | "high";
  this_period_learned: string[];
  recurring_questions: string[];
  knowledge_gaps_detected: string[];
}

export interface UserPortrait {
  identity_summary: string;
  identity: PortraitIdentity;
  knowledge_map: KnowledgeMap;
  work_patterns: {
    prefers_deep_focus: boolean;
    writing_to_reading_ratio: number;
    session_style: string;
  };
  research_trajectory: ResearchTrajectory;
  interaction_style: InteractionStyle;
  growth_signals: GrowthSignals;
  lyra_service_notes: string;
  /** AI-generated avatar URL (set when public home is generated). May be null if not yet generated. */
  avatar_url?: string | null;
}

export interface PortraitVersion {
  version: number;
  synthesis_summary: string | null;
  synthesized_at: string | null;
  portrait_json: UserPortrait | null;
}

/** 获取当前用户的画像 */
export async function getMyPortrait(): Promise<UserPortrait | null> {
  return http.get<UserPortrait | null>(PORTRAIT.ME);
}

/** 获取画像历史版本 */
export async function getPortraitHistory(): Promise<PortraitVersion[]> {
  return http.get<PortraitVersion[]>(PORTRAIT.HISTORY);
}

/** 手动触发画像合成（用于测试） */
export async function triggerPortraitSynthesis(): Promise<void> {
  await http.post(PORTRAIT.TRIGGER, {});
}
