"use client"

/**
 * @file MCP 工具调用人工审批卡片
 * @description Human-in-the-Loop 审批 UI，AI 调用 MCP 工具前暂停并展示本卡片，
 *              用户可选择"批准"或"拒绝"，支持加载态和已审批态的视觉反馈。
 */

import { Check, ShieldAlert, X } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "./utils"

interface ToolCallInfo {
  name: string
  arguments: Record<string, unknown>
}

interface ApprovalCardProps {
  toolCalls: ToolCallInfo[]
  onDecision: (approved: boolean) => Promise<void>
}

function parseMcpName(name: string): { server: string; method: string } | null {
  const idx = name.indexOf("__")
  if (idx === -1) return null
  return { server: name.slice(0, idx), method: name.slice(idx + 2) }
}

export function ApprovalCard({ toolCalls, onDecision }: ApprovalCardProps) {
  const t = useTranslations("genui")
  const [status, setStatus] = useState<"pending" | "loading" | "approved" | "rejected">("pending")

  const handle = async (approved: boolean) => {
    if (status !== "pending") return
    setStatus("loading")
    try {
      await onDecision(approved)
      setStatus(approved ? "approved" : "rejected")
    } catch {
      setStatus("pending")
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-background shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border/40">
        <ShieldAlert size={12} className="flex-shrink-0 text-amber-400/80" />
        <span className="text-[11px] font-medium text-foreground/70">
          {t("approvalHeader")}
        </span>
      </div>

      {/* Tool list */}
      <div className="px-3 py-2 space-y-1.5">
        {toolCalls.map((tc, i) => {
          const mcp = parseMcpName(tc.name)
          const argsStr = JSON.stringify(tc.arguments)
          const hasArgs = argsStr !== "{}"
          return (
            <div key={i} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-2 py-0.5 text-[11px]">
                  {mcp ? (
                    <>
                      <span className="text-purple-400 font-medium">{mcp.server}</span>
                      <span className="text-muted-foreground/40">→</span>
                      <span className="text-foreground/75 font-medium">{mcp.method}</span>
                    </>
                  ) : (
                    <span className="text-foreground/75 font-medium">{tc.name}</span>
                  )}
                </span>
              </div>
              {hasArgs && (
                <p className="px-1 text-[10px] font-mono text-muted-foreground/40 truncate max-w-full">
                  {argsStr.length > 120 ? argsStr.slice(0, 120) + "…" : argsStr}
                </p>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="flex items-center gap-2 px-3 pb-2.5">
        {status === "pending" && (
          <>
            <button
              type="button"
              onClick={() => handle(true)}
              className="flex items-center gap-1 rounded-lg bg-emerald-500/15 px-3 py-1.5 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/25"
            >
              <Check size={10} strokeWidth={2.5} />
              {t("allow")}
            </button>
            <button
              type="button"
              onClick={() => handle(false)}
              className="flex items-center gap-1 rounded-lg bg-muted/60 px-3 py-1.5 text-[11px] font-medium text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground/70"
            >
              <X size={10} strokeWidth={2.5} />
              {t("deny")}
            </button>
          </>
        )}
        {status === "loading" && (
          <span className="text-[11px] text-muted-foreground/40">{t("processingAction")}</span>
        )}
        {status === "approved" && (
          <span className={cn("flex items-center gap-1 text-[11px] text-emerald-400/80")}>
            <Check size={10} />{t("allowed")}
          </span>
        )}
        {status === "rejected" && (
          <span className={cn("flex items-center gap-1 text-[11px] text-muted-foreground/50")}>
            <X size={10} />{t("denied")}
          </span>
        )}
      </div>
    </div>
  )
}
