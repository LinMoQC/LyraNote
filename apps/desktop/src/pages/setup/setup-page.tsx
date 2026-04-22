import { useEffect, useState } from "react"

import { RuntimeStatusScreen } from "@/components/runtime/runtime-status-screen"
import { fileReveal, runtimeRestart, runtimeStatus } from "@/lib/desktop-bridge"
import type { DesktopRuntimeStatus } from "@/types"

export function SetupPage() {
  const [status, setStatus] = useState<DesktopRuntimeStatus | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      setLoading(true)
      try {
        const nextStatus = await runtimeStatus()
        if (!cancelled) {
          setStatus(nextStatus)
        }
      } catch (error) {
        if (!cancelled) {
          setStatus({
            state: "degraded",
            mode: "source",
            health_url: "",
            api_base_url: "",
            pid: null,
            version: null,
            last_error: (error as Error)?.message ?? "Failed to query desktop runtime.",
            last_exit_reason: null,
            last_healthcheck_at: null,
            last_heartbeat_at: null,
            log_path: "",
            state_dir: "",
            sidecar_path: null,
            restart_count: 0,
            watcher_count: 0,
            watchers_paused: false,
            last_restart_at: null,
          })
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [])

  async function handleRestart() {
    try {
      const nextStatus = await runtimeRestart()
      setStatus(nextStatus)
    } catch (error) {
      setStatus((prev) => prev
        ? {
            ...prev,
            state: "degraded",
            last_error: (error as Error)?.message ?? "Failed to restart desktop runtime.",
          }
        : null)
    }
  }

  async function handleRevealLogs() {
    if (!status?.log_path) return
    await fileReveal(status.log_path)
  }

  return (
    <div className="flex h-full items-center justify-center">
      <RuntimeStatusScreen
        status={status}
        loading={loading}
        onRestart={() => void handleRestart()}
        onRevealLogs={() => void handleRevealLogs()}
      />
    </div>
  )
}
