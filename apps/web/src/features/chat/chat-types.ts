import type { ChatRole } from "@/lib/constants";
import type { AgentStep, CitationData } from "@/types";
import type { DrProgress } from "@/features/chat/deep-research-progress";
import { BookOpen, FileText, Globe, Lightbulb } from "lucide-react";

export interface MessageAttachment {
  name: string;
  type: string;
  previewUrl: string | null;
}

export interface StreamingMetrics {
  ttft_ms: number;
  tps: number;
  tokens: number;
}

export interface LocalMessage {
  id: string
  role: ChatRole
  content: string
  reasoning?: string
  timestamp: Date
  citations?: CitationData[]
  agentSteps?: AgentStep[]
  deepResearch?: DrProgress
  attachments?: MessageAttachment[]
  speed?: StreamingMetrics
  uiElements?: Array<{ element_type: string; data: Record<string, unknown> }>
}

export const CONVERSATIONS_PAGE_SIZE = 30;
export const MESSAGES_PAGE_SIZE = 80;

export const SUGGESTED_PROMPTS = [
  { icon: Lightbulb, key: "suggestedPrompts.analyzeThemes" as const },
  { icon: FileText, key: "suggestedPrompts.generateSummary" as const },
  { icon: Globe, key: "suggestedPrompts.compareViews" as const },
  { icon: BookOpen, key: "suggestedPrompts.generatePlan" as const },
];
