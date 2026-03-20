"use client"

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
  Search,
  Sparkles,
  Wrench,
} from "lucide-react"
import { useState } from "react"

import { TRUNCATE_AGENT_OUTPUT } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

const TOOL_META: Record<string, { icon: typeof Search; labelKey: string; color: string }> = {
  search_notebook_knowledge: {
    icon: Search,
    labelKey: "steps.searchKnowledge",
    color: "text-blue-400",
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
  web_search: {
    icon: Globe,
    labelKey: "steps.searchWeb",
    color: "text-cyan-400",
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

/** Thin vertical connector between two nodes */
function Connector({ active }: { active?: boolean }) {
  return (
    <div className="mx-auto mt-0.5 w-px flex-1" style={{ minHeight: 8 }}>
      {active ? (
        <m.div
          className="h-full w-full rounded-full"
          style={{
            background:
              "linear-gradient(to bottom, hsl(var(--primary)/0.5), hsl(var(--primary)/0.15))",
          }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <div className="h-full w-full rounded-full bg-muted/60" />
      )}
    </div>
  )
}

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
  const meta = TOOL_META[step.tool ?? ""] ?? {
    icon: Wrench,
    labelKey: "steps.toolCall",
    color: "text-muted-foreground",
  }
  const Icon = meta.icon
  const inputStr = step.input ? JSON.stringify(step.input) : ""

  return (
    <m.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex gap-2 px-2"
    >
      {/* Timeline column */}
      <div className="flex w-5 flex-shrink-0 flex-col items-center">
        <div
          className={cn(
            "mt-[5px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md transition-all",
            isActive
              ? cn("bg-current/15 ring-1 ring-current/30", meta.color)
              : cn("bg-current/8", meta.color),
          )}
        >
          {isActive
            ? <Loader2 size={10} className={cn("animate-spin", meta.color)} />
            : <Icon size={10} className={meta.color} />
          }
        </div>
        {showConnector && <Connector active={isActive} />}
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => inputStr.length > 30 && setExpanded((o) => !o)}
          className="flex w-full items-center gap-1 py-1.5 text-left"
        >
          <span className="flex-1 truncate text-[12px] font-medium text-foreground/80">
            {t(meta.labelKey)}
          </span>
          {inputStr.length > 30 && (
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
          {expanded && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden"
            >
              <div className="mb-1.5 rounded-lg bg-muted/30 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground/60">
                {inputStr.slice(0, TRUNCATE_AGENT_OUTPUT)}
                {inputStr.length > TRUNCATE_AGENT_OUTPUT && "…"}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  )
}

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
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex gap-2 px-2"
    >
      {/* Timeline column */}
      <div className="flex w-5 flex-shrink-0 flex-col items-center">
        <div className="mt-[5px] flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-emerald-400/10 ring-1 ring-emerald-400/20">
          <CheckCircle2 size={10} className="text-emerald-400" />
        </div>
        {showConnector && <Connector />}
      </div>

      {/* Content column */}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => content.length > 60 && setExpanded((o) => !o)}
          className="flex w-full items-center gap-1 py-1.5 text-left"
        >
          <span className="flex-1 truncate text-[11px] text-muted-foreground/55">
            {content.slice(0, 80) || t("steps.done")}
            {content.length > 80 && "…"}
          </span>
          {content.length > 60 && (
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
                {content}
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </m.div>
  )
}

interface StepLike {
  type: string
  content?: string
  tool?: string
  input?: Record<string, unknown>
}

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
  // Deduplicate: skip a "thought" if the very next step is a "tool_call"
  const visibleSteps = rawSteps.filter(
    (s, i) => !(s.type === "thought" && rawSteps[i + 1]?.type === "tool_call"),
  )

  if (visibleSteps.length === 0) return null

  // Total rows = visibleSteps + (isStreaming ? 1 : 0)
  const totalRows = visibleSteps.length + (isStreaming ? 1 : 0)

  return (
    <div className={cn("mb-3", className)}>
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
          查看推理过程
        </span>
        <ChevronDown
          size={11}
          className={cn(
            "text-muted-foreground/40 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            className="overflow-hidden"
          >
            <div className="ml-1 mt-1 rounded-xl border border-border/30 bg-muted/20 px-1 py-2">
              {visibleSteps.map((step, i) => {
                const rowIndex = i
                const isLastRow = rowIndex === totalRows - 1
                const showConnector = !isLastRow

                if (step.type === "thought") {
                  const isActive = i === visibleSteps.length - 1 && isStreaming
                  return (
                    <m.div
                      key={i}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                      className="flex gap-2 px-2"
                    >
                      {/* Timeline column */}
                      <div className="flex w-5 flex-shrink-0 flex-col items-center">
                        <div className="relative mt-[9px] flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center">
                          <div
                            className={cn(
                              "h-1.5 w-1.5 rounded-full transition-colors",
                              isActive ? "bg-primary/80" : "bg-primary/20",
                            )}
                          />
                          {isActive && (
                            <m.div
                              className="absolute inset-0 rounded-full bg-primary/40"
                              animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
                              transition={{ duration: 1.4, repeat: Infinity }}
                            />
                          )}
                        </div>
                        {showConnector && <Connector active={isActive} />}
                      </div>
                      {/* Content column */}
                      <div className="min-w-0 flex-1 py-1.5">
                        <span className="text-[12px] leading-relaxed text-foreground/50 italic">
                          {step.content}
                        </span>
                      </div>
                    </m.div>
                  )
                }

                const isActive = i === visibleSteps.length - 1 && isStreaming
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
                    <ToolResultStep key={i} step={step} showConnector={showConnector} />
                  )
                return null
              })}

              {/* Streaming indicator row */}
              {isStreaming && (
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 px-2"
                >
                  <div className="flex w-5 flex-shrink-0 justify-center pt-[9px]">
                    <m.div
                      className="h-1.5 w-1.5 rounded-full bg-primary/50"
                      animate={{ scale: [1, 1.5, 1], opacity: [1, 0.3, 1] }}
                      transition={{ duration: 0.9, repeat: Infinity }}
                    />
                  </div>
                  <span className="py-1.5 text-[11px] text-muted-foreground/40">{t("steps.thinking")}</span>
                </m.div>
              )}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
