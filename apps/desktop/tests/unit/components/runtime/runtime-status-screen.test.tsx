import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RuntimeStatusScreen } from "@/components/runtime/runtime-status-screen"

describe("RuntimeStatusScreen", () => {
  it("renders watcher and restart diagnostics fields", () => {
    render(
      <RuntimeStatusScreen
        status={{
          state: "degraded",
          mode: "bundled",
          health_url: "http://127.0.0.1:8123/health",
          api_base_url: "http://127.0.0.1:8123/api/v1",
          pid: 321,
          version: "0.3.0",
          last_error: "sidecar exited",
          last_exit_reason: "signal: 9",
          last_healthcheck_at: "2026-04-17T10:00:00Z",
          last_heartbeat_at: "2026-04-17T10:00:05Z",
          log_path: "/tmp/logs",
          state_dir: "/tmp/state",
          sidecar_path: "/tmp/lyranote-api-desktop",
          restart_count: 2,
          watcher_count: 4,
          watchers_paused: true,
          last_restart_at: "2026-04-17T09:59:00Z",
        }}
      />,
    )

    expect(screen.getByText("Watcher")).toBeInTheDocument()
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByText("监听目录")).toBeInTheDocument()
    expect(screen.getByText("已暂停")).toBeInTheDocument()
    expect(screen.getByText("重启次数")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("上次退出原因")).toBeInTheDocument()
    expect(screen.getByText("signal: 9")).toBeInTheDocument()
    expect(screen.getByText("最近心跳")).toBeInTheDocument()
    expect(screen.getByText("2026-04-17T10:00:05Z")).toBeInTheDocument()
  })
})
