"use client"

/**
 * @file Agent 步骤可视化组件
 * @description Perplexity 风格：无边框，思考内容作为工具调用描述，展开显示 query + 结果条数。
 *              流式阶段：ThinkingLabel（头像旁）处理。
 *              完成后：「已完成 N 个步骤 ›」收起，点击展开。
 */

import { AnimatePresence, m } from "framer-motion"
import { useEffect, useMemo, useState } from "react"
import {
  BookOpen,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileSearch,
  GitCompareArrows,
  Globe,
  Minimize2,
  Network,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  Unplug,
  Wrench,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

const TOOL_META: Record<string, { icon: typeof Search; labelKey: string; color: string }> = {
  search_notebook_knowledge: { icon: Search, labelKey: "steps.searchKnowledge", color: "text-blue-400" },
  rag_search: { icon: Search, labelKey: "steps.searchKnowledge", color: "text-blue-400" },
  web_search: { icon: Globe, labelKey: "steps.searchWeb", color: "text-cyan-400" },
  summarize_sources: { icon: FileSearch, labelKey: "steps.generateSummary", color: "text-emerald-400" },
  create_note_draft: { icon: Sparkles, labelKey: "steps.createNote", color: "text-amber-400" },
  update_user_preference: { icon: Wrench, labelKey: "steps.savePreference", color: "text-violet-400" },
  create_scheduled_task: { icon: Clock, labelKey: "steps.createTask", color: "text-orange-400" },
  generate_mind_map: { icon: Network, labelKey: "steps.generateMindMap", color: "text-pink-400" },
  generate_diagram: { icon: Network, labelKey: "steps.generateDiagram", color: "text-blue-400" },
  deep_read_sources: { icon: BookOpen, labelKey: "steps.deepRead", color: "text-indigo-400" },
  compare_sources: { icon: GitCompareArrows, labelKey: "steps.compareSources", color: "text-teal-400" },
  update_memory_doc: { icon: Brain, labelKey: "steps.updateMemory", color: "text-purple-400" },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseMcpTool(toolName: string): { server: string; method: string } | null {
  const idx = toolName.indexOf("__")
  if (idx === -1) return null
  return { server: toolName.slice(0, idx), method: toolName.slice(idx + 2) }
}

function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground/70 not-italic">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// System status metadata — maps is_system thought keys to icon + label
// ---------------------------------------------------------------------------

const SYSTEM_STATUS_META: Record<string, { icon: typeof Search; label: string; color: string }> = {
  verify:           { icon: ShieldCheck, label: "核对结果一致性", color: "text-amber-400" },
  context_compress: { icon: Minimize2,   label: "压缩上下文",    color: "text-slate-400" },
  synthesis:        { icon: Sparkles,    label: "整合研究资料",  color: "text-violet-400" },
}

// ---------------------------------------------------------------------------
// Group building — pair thought + tool_call + tool_result together
// ---------------------------------------------------------------------------

interface StepLike {
  type: string
  content?: string
  tool?: string
  input?: Record<string, unknown>
  is_system?: boolean
}

type StepGroup =
  | { kind: "thought"; content: string }
  | { kind: "system"; key: string }
  | { kind: "tool"; description: string | null; call: StepLike; result: StepLike | null }

function buildGroups(steps: StepLike[]): StepGroup[] {
  const raw = steps.filter(
    (s) => s.type === "thought" || s.type === "tool_call" || s.type === "tool_result",
  )
  const groups: StepGroup[] = []
  let i = 0
  while (i < raw.length) {
    const s = raw[i]
    if (s.type === "thought") {
      // System status thoughts — render as a dedicated status row
      if (s.is_system) {
        groups.push({ kind: "system", key: s.content ?? "" })
        i++
        continue
      }
      const next = raw[i + 1]
      if (next?.type === "tool_call" && !s.content?.includes("→")) {
        // Absorb thought as the tool description
        const afterCall = raw[i + 2]
        const result = afterCall?.type === "tool_result" ? afterCall : null
        groups.push({ kind: "tool", description: s.content ?? null, call: next, result })
        i += result ? 3 : 2
      } else {
        // Standalone routing thought
        groups.push({ kind: "thought", content: s.content ?? "" })
        i++
      }
    } else if (s.type === "tool_call") {
      const next = raw[i + 1]
      const result = next?.type === "tool_result" ? next : null
      groups.push({ kind: "tool", description: null, call: s, result })
      i += result ? 2 : 1
    } else {
      i++ // orphan tool_result — skip
    }
  }
  return groups
}

// ---------------------------------------------------------------------------
// Row components
// ---------------------------------------------------------------------------

function SystemRow({ statusKey }: { statusKey: string }) {
  const meta = SYSTEM_STATUS_META[statusKey]
  if (!meta) return null
  const Icon = meta.icon
  return (
    <div className="flex items-center gap-2.5 py-1">
      <Icon size={12} className={cn("flex-shrink-0", meta.color)} />
      <span className="text-[11.5px] text-muted-foreground/45">{meta.label}</span>
    </div>
  )
}

function ThoughtRow({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      <Route size={11} className="mt-0.5 flex-shrink-0 text-primary/35" />
      <span className="text-[11.5px] italic leading-relaxed text-muted-foreground/40">
        <InlineMd text={content} />
      </span>
    </div>
  )
}

function ToolRow({ group }: { group: Extract<StepGroup, { kind: "tool" }> }) {
  const t = useTranslations("copilot")
  const [expanded, setExpanded] = useState(false)

  const mcpParts = group.call.tool ? parseMcpTool(group.call.tool) : null
  const meta = mcpParts
    ? { icon: Unplug, color: "text-purple-400" }
    : {
        icon: TOOL_META[group.call.tool ?? ""]?.icon ?? Wrench,
        color: TOOL_META[group.call.tool ?? ""]?.color ?? "text-muted-foreground/60",
      }
  const Icon = meta.icon

  const builtinLabelKey = !mcpParts ? (TOOL_META[group.call.tool ?? ""]?.labelKey ?? null) : null
  const fallbackLabel = mcpParts
    ? `${mcpParts.server} → ${mcpParts.method}`
    : builtinLabelKey
      ? t(builtinLabelKey as Parameters<typeof t>[0])
      : (group.call.tool ?? t("steps.toolCall"))
  const displayText = group.description ?? fallbackLabel

  // Parse result count from tool_result content
  const resultContent = group.result?.content ?? ""
  const resultCount = (() => {
    const frags = resultContent.match(/\[片段/g)
    if (frags) return frags.length
    const webs = resultContent.match(/\[结果/g)
    if (webs) return webs.length
    return null
  })()

  // Input query for sub-display
  const input = group.call.input ?? {}
  const queryVal = (input.query ?? input.topic ?? input.text ?? Object.values(input)[0]) as string | undefined
  const hasDetails = !!queryVal || resultCount !== null

  return (
    <div className="py-0.5">
      <button
        type="button"
        onClick={() => hasDetails && setExpanded((o) => !o)}
        className={cn(
          "flex w-full items-start gap-2.5 rounded py-1 text-left transition-opacity",
          hasDetails ? "cursor-pointer hover:opacity-70" : "cursor-default",
        )}
      >
        <Icon size={13} className={cn("mt-[1px] flex-shrink-0", meta.color)} />
        <span className="flex-1 text-[12px] leading-relaxed text-foreground/65">
          <InlineMd text={displayText} />
        </span>
        {hasDetails && (
          <ChevronDown
            size={11}
            className={cn(
              "mt-[3px] flex-shrink-0 text-muted-foreground/25 transition-transform duration-200",
              expanded && "rotate-180",
            )}
          />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="ml-[21px] space-y-1 pb-1 pt-0.5">
              {queryVal && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/40">
                  <Search size={10} className="flex-shrink-0" />
                  <span className="truncate">{String(queryVal).slice(0, 120)}</span>
                </div>
              )}
              {resultCount !== null && (
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/35">
                  <CheckCircle2 size={10} className="flex-shrink-0 text-emerald-400/50" />
                  <span>
                    {group.call.tool === "web_search"
                      ? `找到 ${resultCount} 条网络结果`
                      : `找到 ${resultCount} 个相关片段`}
                  </span>
                </div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ThinkingLabel — shown next to BotAvatar during streaming
// ---------------------------------------------------------------------------

function getStepLabel(steps: StepLike[], t: ReturnType<typeof useTranslations<"copilot">>): string {
  const last = steps[steps.length - 1]
  if (!last || last.type === "tool_result") {
    return t("steps.thinking")
  }
  if (last.type === "thought" && last.is_system) {
    return SYSTEM_STATUS_META[last.content ?? ""]?.label ?? t("steps.thinking")
  }
  if (last.type === "thought") {
    const text = last.content?.trim() ?? ""
    if (text) return text.length > 50 ? text.slice(0, 48) + "…" : text
    return t("steps.thinking")
  }
  if (last.type === "tool_call") {
    const meta = TOOL_META[last.tool ?? ""]
    if (meta) return t(meta.labelKey as Parameters<typeof t>[0])
    const mcp = last.tool ? parseMcpTool(last.tool) : null
    if (mcp) return `${mcp.server} · ${mcp.method}`
    return t("steps.toolCall")
  }
  return t("steps.thinking")
}

/**
 * ThinkingBubble — a comic-style thought bubble shown near the bot avatar.
 * Floats above the avatar; disappears once real content starts flowing.
 *
 * `streamingContent` — raw token text to show when no agent steps have arrived
 * yet (very early phase before first thought/tool event). Takes precedence over
 * the default "thinking" label so the user sees the live transition text.
 */
export function ThinkingBubble({ steps, streamingContent }: { steps: StepLike[]; streamingContent?: string }) {
  const t = useTranslations("copilot")
  const stepsLabel = getStepLabel(steps, t)
  const label = steps.length === 0 && streamingContent?.trim()
    ? (streamingContent.length > 48 ? streamingContent.slice(0, 46) + "…" : streamingContent)
    : stepsLabel

  return (
    <AnimatePresence mode="wait">
      <m.div
        key={label}
        initial={{ opacity: 0, scale: 0.85, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 4 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="relative"
      >
        {/* Bubble body */}
        <div className="rounded-2xl rounded-bl-sm bg-muted/70 px-2.5 py-1.5 shadow-sm backdrop-blur-sm">
          <m.span
            className="block text-[11px] italic leading-none text-muted-foreground/70"
            animate={{ opacity: [0.4, 0.85, 0.4] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            {label}
          </m.span>
        </div>
        {/* Tail dots — pointing down toward avatar */}
        <span className="absolute -bottom-[7px] left-2 h-[5px] w-[5px] rounded-full bg-muted/70" />
        <span className="absolute -bottom-[13px] left-[14px] h-[4px] w-[4px] rounded-full bg-muted/60" />
      </m.div>
    </AnimatePresence>
  )
}

/** @deprecated use ThinkingBubble instead */
export function ThinkingLabel({ steps }: { steps: StepLike[] }) {
  return <ThinkingBubble steps={steps} />
}


// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function AgentSteps({
  steps,
  isStreaming,
  className,
}: {
  steps: StepLike[]
  isStreaming: boolean
  className?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!isStreaming) setOpen(false)
  }, [isStreaming])

  const groups = useMemo(() => buildGroups(steps), [steps])

  if (isStreaming || groups.length === 0) return null

  return (
    <m.div
      className={cn("mb-2", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.08 } }}
    >
      {/* Collapsed summary */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 py-1 text-[11.5px] text-muted-foreground/45 transition-colors hover:text-muted-foreground/70"
      >
        <span>已完成 {groups.length} 个步骤</span>
        <ChevronRight
          size={11}
          className={cn("transition-transform duration-200", open && "rotate-90")}
        />
      </button>

      {/* Expanded step list */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="overflow-hidden"
          >
            <div className="pl-1 pt-0.5">
              {groups.map((g, i) =>
                g.kind === "thought" ? (
                  <ThoughtRow key={i} content={g.content} />
                ) : g.kind === "system" ? (
                  <SystemRow key={i} statusKey={g.key} />
                ) : (
                  <ToolRow key={i} group={g} />
                ),
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </m.div>
  )
}
