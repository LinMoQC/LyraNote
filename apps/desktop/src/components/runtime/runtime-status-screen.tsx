import { motion } from "framer-motion"
import { AlertCircle, Loader2, RefreshCw, Terminal } from "lucide-react"

import { springs } from "@/lib/animations"
import type { DesktopRuntimeStatus } from "@/types"

export function RuntimeStatusScreen({
  status,
  loading,
  onRestart,
  onRevealLogs,
}: {
  status: DesktopRuntimeStatus | null
  loading?: boolean
  onRestart?: () => void
  onRevealLogs?: () => void
}) {
  const isReady = status?.state === "ready"
  const isStarting = !status || status.state === "starting" || loading
  const hasError = status?.state === "degraded" || status?.state === "stopped"

  return (
    <div className="flex h-full items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springs.smooth}
        className="w-[420px] rounded-2xl border p-6"
        style={{
          background: "rgba(255,255,255,0.03)",
          borderColor: "var(--color-border)",
        }}
      >
        <div className="mb-5 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl"
            style={{
              background: hasError ? "rgba(248,113,113,0.12)" : "rgba(124,110,247,0.12)",
              color: hasError ? "rgb(248,113,113)" : "var(--color-accent)",
            }}
          >
            {isStarting ? <Loader2 size={18} className="animate-spin" /> : hasError ? <AlertCircle size={18} /> : <Terminal size={18} />}
          </div>
          <div>
            <h2 className="text-[20px] font-semibold text-[var(--color-text-primary)]">
              {isStarting ? "正在启动桌面 Runtime" : isReady ? "桌面 Runtime 已就绪" : "桌面 Runtime 需要处理"}
            </h2>
            <p className="mt-1 text-[12px] text-[var(--color-text-tertiary)]">
              {isStarting
                ? "LyraNote 正在拉起本地 sidecar 并等待健康检查。"
                : hasError
                  ? "应用没有拿到可用的本地 sidecar，请查看诊断信息。"
                  : "本地 sidecar 已就绪，可以继续使用桌面端。"}
            </p>
          </div>
        </div>

        <div
          className="rounded-xl border p-4 text-[12px]"
          style={{ borderColor: "var(--color-border)", background: "var(--color-bg-subtle)" }}
        >
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">状态</span>
            <span className="text-[var(--color-text-primary)]">{status?.state ?? "starting"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">模式</span>
            <span className="text-[var(--color-text-primary)]">{status?.mode ?? "source"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">PID</span>
            <span className="text-[var(--color-text-primary)]">{status?.pid ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">Health</span>
            <span className="max-w-[240px] truncate text-[var(--color-text-primary)]">{status?.health_url ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">最近错误</span>
            <span className="max-w-[240px] truncate text-right text-[var(--color-text-primary)]">
              {status?.last_error ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">上次退出原因</span>
            <span className="max-w-[240px] truncate text-right text-[var(--color-text-primary)]">
              {status?.last_exit_reason ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">Watcher</span>
            <span className="text-[var(--color-text-primary)]">{status?.watcher_count ?? 0}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">监听目录</span>
            <span className="text-[var(--color-text-primary)]">
              {status?.watchers_paused ? "已暂停" : "运行中"}
            </span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">重启次数</span>
            <span className="text-[var(--color-text-primary)]">{status?.restart_count ?? 0}</span>
          </div>
          <div className="flex items-center justify-between py-1.5">
            <span className="text-[var(--color-text-tertiary)]">最近心跳</span>
            <span className="max-w-[240px] truncate text-right text-[var(--color-text-primary)]">
              {status?.last_heartbeat_at ?? "—"}
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={onRestart}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[12px] font-medium text-white"
            style={{ background: "linear-gradient(135deg, #7c6ef7, #6254e0)" }}
          >
            <RefreshCw size={13} />
            重启 Runtime
          </motion.button>
          <button
            onClick={onRevealLogs}
            className="rounded-xl border px-4 py-2 text-[12px] font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            style={{ borderColor: "var(--color-border)" }}
          >
            打开日志目录
          </button>
        </div>
      </motion.div>
    </div>
  )
}
