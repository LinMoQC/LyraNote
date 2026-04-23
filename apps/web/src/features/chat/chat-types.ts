import type { ChatRole } from "@/lib/constants";
import type { AgentStep, CitationData, DiagramData, MindMapData, MCPResultData } from "@/types";
import type { DrProgress } from "@/components/deep-research/deep-research-progress";
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
  /** Stable key for AnimatePresence — never changes when server ID replaces local ID */
  _animKey?: string
  role: ChatRole
  status?: "streaming" | "completed" | "error"
  generationId?: string
  content: string
  reasoning?: string
  timestamp: Date
  citations?: CitationData[]
  agentSteps?: AgentStep[]
  deepResearch?: DrProgress
  attachments?: MessageAttachment[]
  speed?: StreamingMetrics
  uiElements?: Array<{ element_type: string; data: Record<string, unknown> }>
  mindMap?: MindMapData
  diagram?: DiagramData
  mcpResult?: MCPResultData
}

export const CONVERSATIONS_PAGE_SIZE = 30;
export const MESSAGES_PAGE_SIZE = 80;

export const SUGGESTED_PROMPTS = [
  { icon: Lightbulb, key: "suggestedPrompts.analyzeThemes" as const },
  { icon: FileText, key: "suggestedPrompts.generateSummary" as const },
  { icon: Globe, key: "suggestedPrompts.compareViews" as const },
  { icon: BookOpen, key: "suggestedPrompts.generatePlan" as const },
];
