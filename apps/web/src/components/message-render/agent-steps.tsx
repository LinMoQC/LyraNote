"use client"

/**
 * @file Agent 步骤可视化组件
 * @description 展示 AI 推理过程中的思考链和工具调用步骤，以可折叠时间线形式呈现。
 *              支持 routing thought / tool call / tool result 三种步骤的差异化展示，
 *              配有 stagger 入场、draw-in 连接线、shimmer 扫描、弹入 check 等动画。
 *              被 chat 和 copilot 共用。
 */

import { AnimatePresence, m } from "framer-motion"
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
  Loader2,
  Network,
  Route,
  Search,
  Sparkles,
  Unplug,
  Wrench,
} from "lucide-react"
import { useState } from "react"

import { TRUNCATE_AGENT_OUTPUT } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

// ---------------------------------------------------------------------------
// Framer Motion variants
// ---------------------------------------------------------------------------

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  show: {
    opacity: 1,
    x: 0,
    transition: { type: "spring" as const, stiffness: 380, damping: 28 },
  },
}

// ---------------------------------------------------------------------------
// Tool metadata
// ---------------------------------------------------------------------------

const TOOL_META: Record<string, { icon: typeof Search; labelKey: string; color: string }> = {
  search_notebook_knowledge: {
    icon: Search,
    labelKey: "steps.searchKnowledge",
    color: "text-blue-400",
  },
  rag_search: {
    icon: Search,
    labelKey: "steps.searchKnowledge",
    color: "text-blue-400",
  },
  web_search: {
    icon: Globe,
    labelKey: "steps.searchWeb",
    color: "text-cyan-400",
  },
  summarize_sources: {
    icon: FileSearch,
    labelKey: "steps.generateSummary",
    color: "text-emerald-400",
  },
  create_note_draft: {
    icon: Sparkles,
    labelKey: "steps.createNote",
    color: "text-amber-400",
  },
  update_user_preference: {
    icon: Wrench,
    labelKey: "steps.savePreference",
    color: "text-violet-400",
  },
  create_scheduled_task: {
    icon: Clock,
    labelKey: "steps.createTask",
    color: "text-orange-400",
  },
  generate_mind_map: {
    icon: Network,
    labelKey: "steps.generateMindMap",
    color: "text-pink-400",
  },
  generate_diagram: {
    icon: Network,
    labelKey: "steps.generateDiagram",
    color: "text-blue-400",
  },
  deep_read_sources: {
    icon: BookOpen,
    labelKey: "steps.deepRead",
    color: "text-indigo-400",
  },
  compare_sources: {
    icon: GitCompareArrows,
    labelKey: "steps.compareSources",
    color: "text-teal-400",
  },
  update_memory_doc: {
    icon: Brain,
    labelKey: "steps.updateMemory",
    color: "text-purple-400",
  },
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Thin vertical connector that "draws in" from top to bottom. */
function Connector({ active }: { active?: boolean }) {
  return (
    <div className="mx-auto mt-0.5 w-px flex-1" style={{ minHeight: 10 }}>
      <m.div
        className="h-full w-full rounded-full"
        initial={{ scaleY: 0 }}
        animate={{ scaleY: 1 }}
        transition={{ duration: 0.28, ease: "easeOut" }}
        style={{
          transformOrigin: "top",
          background: active
            ? "linear-gradient(to bottom, hsl(var(--primary)/0.55), hsl(var(--primary)/0.15))"
            : "hsl(var(--muted-foreground)/0.2)",
        }}
      />
    </div>
  )
}

/** Render inline string with **bold** markdown support. */
function InlineMd({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-foreground/80 not-italic">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  )
}

/** Format tool input as human-friendly key-value instead of raw JSON. */
function InputPreview({ input, expanded }: { input: Record<string, unknown>; expanded: boolean }) {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && (v as unknown[]).length === 0))
  if (entries.length === 0) return null

  if (!expanded) {
    const queryVal = (input.query ?? input.topic ?? input.text ?? Object.values(input)[0]) as
      | string
      | undefined
    if (!queryVal) return null
    return (
      <span className="truncate text-[10px] text-muted-foreground/40">
        {String(queryVal).slice(0, 60)}
        {String(queryVal).length > 60 ? "…" : ""}
      </span>
    )
  }

  return (
    <div className="mb-1.5 space-y-1 rounded-lg bg-muted/25 px-2.5 py-2 text-[10px] leading-relaxed">
      {entries.map(([k, v]) => (
        <div key={k} className="flex gap-1.5">
          <span className="shrink-0 text-muted-foreground/40">{k}</span>
          <span className="min-w-0 break-all text-muted-foreground/70">
            {typeof v === "boolean"
              ? (v ? "✓" : "✗")
              : Array.isArray(v)
                ? (
                  <span className="flex flex-col gap-0.5">
                    {(v as unknown[]).map((item, i) => (
                      <span key={i} className="block">{String(item).slice(0, 200)}</span>
                    ))}
                  </span>
                )
                : String(v).slice(0, 200)}
          </span>
        </div>
      ))}
    </div>
  )
}

/** Parse an MCP-namespaced tool name (e.g. "excalidraw_mcp__create_view"). */
function parseMcpTool(toolName: string): { server: string; method: string } | null {
  const idx = toolName.indexOf("__")
  if (idx === -1) return null
  return { server: toolName.slice(0, idx), method: toolName.slice(idx + 2) }
}

// ---------------------------------------------------------------------------
// Step sub-components
// ---------------------------------------------------------------------------

interface StepLike {
  type: string
  content?: string
  tool?: string
  input?: Record<string, unknown>
}

/** Routing thought (contains "→") — distinct pill-style treatment. */
function RoutingThoughtStep({
  step,
  showConnector,
}: {
  step: StepLike
  showConnector?: boolean
}) {
  return (
    <m.div
      variants={itemVariants}
      className="flex gap-2 px-2"
    >
      {/* Timeline column */}
      <div className="flex w-5 flex-shrink-0 flex-col items-center">
        <div className="mt-[5px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 ring-1 ring-primary/20">
          <Route size={10} className="text-primary/70" />
        </div>
        {showConnector && <Connector />}
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1 py-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/6 px-2.5 py-0.5 text-[11px] font-medium text-foreground/65 ring-1 ring-primary/12">
          <InlineMd text={step.content ?? ""} />
        </span>
      </div>
    </m.div>
  )
}

/** Normal thought — inner monologue style (italic, small dot). */
function ThoughtStep({
  step,
  showConnector,
  isActive,
}: {
  step: StepLike
  showConnector?: boolean
  isActive?: boolean
}) {
  // System operation thoughts (start with an emoji like 📝, ⚙️, 🔄) get a compact badge style
  const content = step.content ?? ""
  const isSystemOp = /^[\p{Emoji}]/u.test(content)

  if (isSystemOp) {
    return (
      <m.div variants={itemVariants} className="flex gap-2 px-2">
        {/* Timeline column */}
        <div className="flex w-5 flex-shrink-0 flex-col items-center">
          <div className="relative mt-[9px] flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center">
            <div className="h-1 w-1 rounded-full bg-muted-foreground/20" />
          </div>
          {showConnector && <Connector />}
        </div>
        {/* Content column — compact inline badge */}
        <div className="min-w-0 flex-1 py-1">
          <span className="inline-flex items-center gap-1 rounded-md bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground/40">
            {content}
          </span>
        </div>
      </m.div>
    )
  }

  return (
    <m.div
      variants={itemVariants}
      className="flex gap-2 px-2"
    >
      {/* Timeline column */}
      <div className="flex w-5 flex-shrink-0 flex-col items-center">
        <div className="relative mt-[9px] flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center">
          <div
            className={cn(
              "h-1.5 w-1.5 rounded-full transition-colors",
              isActive ? "bg-primary/80" : "bg-primary/25",
            )}
          />
          {isActive && (
            <m.div
              className="absolute inset-0 rounded-full bg-primary/40"
              animate={{ scale: [1, 2.2, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          )}
        </div>
        {showConnector && <Connector active={isActive} />}
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1 py-1.5">
        <span className="text-[11.5px] italic leading-relaxed text-foreground/45">
          <InlineMd text={step.content ?? ""} />
        </span>
      </div>
    </m.div>
  )
}

/** Tool call step — shimmer overlay when active. */
function ToolCallStep({
  step,
  showConnector,
  isActive,
}: {
  step: StepLike
  showConnector?: boolean
  isActive?: boolean
}) {
  const t = useTranslations("copilot")
  const [expanded, setExpanded] = useState(false)
  const hasInput = step.input && Object.keys(step.input).length > 0

  const mcpParts = step.tool ? parseMcpTool(step.tool) : null
  const meta = mcpParts
    ? { icon: Unplug, color: "text-purple-400" }
    : {
        icon: TOOL_META[step.tool ?? ""]?.icon ?? Wrench,
        color: TOOL_META[step.tool ?? ""]?.color ?? "text-muted-foreground",
      }
  const builtinLabelKey = !mcpParts
    ? (TOOL_META[step.tool ?? ""]?.labelKey ?? "steps.toolCall")
    : null
  const Icon = meta.icon

  return (
    <m.div
      variants={itemVariants}
      className="flex gap-2 px-2"
    >
      {/* Timeline column */}
      <div className="flex w-5 flex-shrink-0 flex-col items-center">
        <div
          className={cn(
            "relative mt-[5px] flex h-5 w-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-md transition-all",
            isActive
              ? cn("ring-1 ring-current/30", meta.color, "bg-current/12")
              : cn("bg-current/8", meta.color),
          )}
        >
          {isActive ? (
            <Loader2 size={10} className={cn("animate-spin", meta.color)} />
          ) : (
            <Icon size={10} className={meta.color} />
          )}
        </div>
        {showConnector && <Connector active={isActive} />}
      </div>

      {/* Content column */}
      <div className="relative min-w-0 flex-1 overflow-hidden rounded-lg">
        {/* Shimmer sweep when active */}
        {isActive && (
          <m.div
            className="pointer-events-none absolute inset-0 z-10"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, hsl(var(--primary)/0.08) 50%, transparent 100%)",
            }}
            animate={{ x: ["-100%", "100%"] }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
          />
        )}

        <button
          type="button"
          onClick={() => hasInput && setExpanded((o) => !o)}
          className={cn(
            "flex w-full items-center gap-1 px-1 py-1.5 text-left",
            hasInput && "cursor-pointer",
          )}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {mcpParts ? (
              <span className="flex min-w-0 items-center gap-1 truncate text-[12px] font-medium">
                <span className={cn("truncate", meta.color)}>{mcpParts.server}</span>
                <span className="text-muted-foreground/40">→</span>
                <span className="truncate text-foreground/80">{mcpParts.method}</span>
              </span>
            ) : (
              <span className="truncate text-[12px] font-medium text-foreground/80">
                {builtinLabelKey ? t(builtinLabelKey) : step.tool}
              </span>
            )}
            {!expanded && hasInput && step.input && (
              <InputPreview input={step.input} expanded={false} />
            )}
          </div>
          {hasInput && (
            <ChevronRight
              size={10}
              className={cn(
                "flex-shrink-0 text-muted-foreground/40 transition-transform",
                expanded && "rotate-90",
              )}
            />
          )}
        </button>

        <AnimatePresence>
          {expanded && hasInput && step.input && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden px-1"
            >
              <InputPreview input={step.input} expanded />
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  )
}

/** Tool result step — CheckCircle pops in. */
function ToolResultStep({
  step,
  showConnector,
}: {
  step: StepLike
  showConnector?: boolean
}) {
  const t = useTranslations("copilot")
  const [expanded, setExpanded] = useState(false)
  const content = step.content ?? ""

  return (
    <m.div
      variants={itemVariants}
      className="flex gap-2 px-2"
    >
      {/* Timeline column */}
      <div className="flex w-5 flex-shrink-0 flex-col items-center">
        <m.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 22 }}
          className="mt-[5px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-emerald-400/10 ring-1 ring-emerald-400/20"
        >
          <CheckCircle2 size={10} className="text-emerald-400" />
        </m.div>
        {showConnector && <Connector />}
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => content.length > 20 && setExpanded((o) => !o)}
          className="flex w-full items-center gap-1 px-1 py-1.5 text-left"
        >
          <span className="flex-1 truncate text-[11px] text-muted-foreground/55">
            {content.split("\n")[0].slice(0, 80) || t("steps.done")}
            {content.split("\n").length > 1 && !expanded && " …"}
          </span>
          {content.length > 20 && (
            <ChevronRight
              size={10}
              className={cn(
                "flex-shrink-0 text-muted-foreground/30 transition-transform",
                expanded && "rotate-90",
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
              <div className="mb-1.5 max-h-40 overflow-y-auto rounded-lg bg-muted/30 px-2.5 py-2 text-[10px] leading-relaxed text-muted-foreground/50">
                {content.split("\n").map((line, idx) => (
                  <div key={idx} className={idx === 0 ? "font-medium text-muted-foreground/70" : "pl-1"}>
                    {line}
                  </div>
                ))}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function AgentSteps({
  steps,
  isStreaming,
  className,
  defaultOpen,
}: {
  steps: StepLike[]
  isStreaming: boolean
  className?: string
  defaultOpen?: boolean
}) {
  const t = useTranslations("copilot")
  const [open, setOpen] = useState(defaultOpen ?? !isStreaming)

  const rawSteps = steps.filter(
    (s) => s.type === "thought" || s.type === "tool_call" || s.type === "tool_result",
  )

  // Deduplicate: skip a single-agent "thought" (e.g. "我需要搜索…") that is
  // immediately followed by the actual tool_call — they are redundant.
  // Multi-agent routing thoughts (containing "→") are intentionally kept.
  const visibleSteps = rawSteps.filter(
    (s, i) =>
      !(
        s.type === "thought" &&
        rawSteps[i + 1]?.type === "tool_call" &&
        !s.content?.includes("→")
      ),
  )

  if (visibleSteps.length === 0) return null

  const totalRows = visibleSteps.length + (isStreaming ? 1 : 0)

  return (
    <div className={cn("mb-3", className)}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="group flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/40"
      >
        {isStreaming ? (
          <Loader2 size={13} className="animate-spin text-primary/70" />
        ) : (
          <Sparkles size={12} className="text-primary/60" />
        )}
        <span className="text-[12px] font-medium text-foreground/60 group-hover:text-foreground/80">
          {t("viewReasoning")}
        </span>
        <ChevronDown
          size={11}
          className={cn(
            "text-muted-foreground/40 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Expandable panel */}
      <AnimatePresence>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="overflow-hidden"
          >
            {/* Panel container with left gradient accent border */}
            <div className="relative ml-1 mt-1 rounded-xl bg-muted/20 px-1 py-2">
              {/* Left accent bar */}
              <div className="absolute inset-y-0 left-0 w-0.5 rounded-full bg-gradient-to-b from-primary/40 via-primary/20 to-transparent" />

              {/* Step list — staggered children */}
              <m.div
                variants={containerVariants}
                initial="hidden"
                animate="show"
              >
                {visibleSteps.map((step, i) => {
                  const isLastVisible = i === visibleSteps.length - 1
                  const showConnector = !(isLastVisible && !isStreaming)
                  const isActive = isLastVisible && isStreaming

                  const isRoutingThought =
                    step.type === "thought" && !!step.content?.includes("→")

                  if (isRoutingThought)
                    return (
                      <RoutingThoughtStep
                        key={i}
                        step={step}
                        showConnector={showConnector}
                      />
                    )

                  if (step.type === "thought")
                    return (
                      <ThoughtStep
                        key={i}
                        step={step}
                        showConnector={showConnector}
                        isActive={isActive}
                      />
                    )

                  if (step.type === "tool_call")
                    return (
                      <ToolCallStep
                        key={i}
                        step={step}
                        showConnector={showConnector}
                        isActive={isActive}
                      />
                    )

                  if (step.type === "tool_result")
                    return (
                      <ToolResultStep
                        key={i}
                        step={step}
                        showConnector={showConnector}
                      />
                    )

                  return null
                })}

                {/* Streaming indicator — three bouncing dots */}
                {isStreaming && (
                  <m.div
                    variants={itemVariants}
                    className="flex gap-2 px-2"
                  >
                    <div className="flex w-5 flex-shrink-0 justify-center pt-[10px]">
                      <div className="flex gap-0.5">
                        {[0, 0.15, 0.3].map((delay, i) => (
                          <m.div
                            key={i}
                            className="h-1 w-1 rounded-full bg-primary/45"
                            animate={{ y: [0, -3, 0], opacity: [0.4, 1, 0.4] }}
                            transition={{ duration: 0.7, repeat: Infinity, delay, ease: "easeInOut" }}
                          />
                        ))}
                      </div>
                    </div>
                    <span className="py-1.5 text-[11px] text-muted-foreground/35">
                      {t("steps.thinking")}
                    </span>
                  </m.div>
                )}
              </m.div>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
