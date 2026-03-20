import {
  FileSearch,
  FileText,
  GitCompare,
  List,
  Radar,
} from "lucide-react";

export const CHAT_TOOL_DEFS = [
  { key: "toolSummarize", hint: "summarize", icon: FileText },
  { key: "toolInsights", hint: "insights", icon: Radar },
  { key: "toolOutline", hint: "outline", icon: List },
  { key: "toolDeepRead", hint: "deep_read", icon: FileSearch },
  { key: "toolCompare", hint: "compare", icon: GitCompare },
] as const;

export type ChatToolDef = (typeof CHAT_TOOL_DEFS)[number];
