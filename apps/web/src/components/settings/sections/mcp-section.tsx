"use client";

import {
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Edit2,
  Loader2,
  Plus,
  Trash2,
  Unplug,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  CreateMCPServerPayload,
  MCPServer,
  MCPTestResult,
} from "@/services/mcp-service";

// ── Inline helpers ─────────────────────────────────────────────────────────────

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

// ── Blank form state ───────────────────────────────────────────────────────────

interface FormState {
  name: string;
  display_name: string;
  transport: "stdio" | "sse" | "http";
  command: string;
  args: string;
  env_vars: string;
  url: string;
  headers: string;
  is_enabled: boolean;
}

const BLANK_FORM: FormState = {
  name: "",
  display_name: "",
  transport: "http",
  command: "",
  args: "",
  env_vars: "",
  url: "",
  headers: "",
  is_enabled: true,
};

function serverToForm(s: MCPServer): FormState {
  return {
    name: s.name,
    display_name: s.displayName ?? "",
    transport: s.transport as "stdio" | "sse" | "http",
    command: s.command ?? "",
    args: s.args ? s.args.join("\n") : "",
    env_vars: s.envVars ? JSON.stringify(s.envVars, null, 2) : "",
    url: s.url ?? "",
    headers: s.headers ? JSON.stringify(s.headers, null, 2) : "",
    is_enabled: s.isEnabled,
  };
}

function formToPayload(f: FormState): CreateMCPServerPayload {
  const args = f.args
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let env_vars: Record<string, string> | null = null;
  if (f.env_vars.trim()) {
    try {
      env_vars = JSON.parse(f.env_vars);
    } catch {
      // ignore malformed JSON
    }
  }

  let headers: Record<string, string> | null = null;
  if (f.headers.trim()) {
    try {
      headers = JSON.parse(f.headers);
    } catch {
      // ignore malformed JSON
    }
  }

  return {
    name: f.name.trim(),
    display_name: f.display_name.trim() || null,
    transport: f.transport,
    command: f.transport === "stdio" ? f.command.trim() || null : null,
    args: f.transport === "stdio" && args.length ? args : null,
    env_vars: f.transport === "stdio" ? env_vars : null,
    url: f.transport !== "stdio" ? f.url.trim() || null : null,
    headers: f.transport !== "stdio" ? headers : null,
    is_enabled: f.is_enabled,
  };
}

// ── Form dialog ────────────────────────────────────────────────────────────────

function MCPServerForm({
  initial,
  onSubmit,
  onClose,
  submitLabel,
}: {
  initial: FormState;
  onSubmit: (payload: CreateMCPServerPayload) => Promise<void>;
  onClose: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("名称不能为空");
      return;
    }
    if (form.transport === "stdio" && !form.command.trim()) {
      setError("stdio 模式需要填写命令");
      return;
    }
    if (form.transport !== "stdio" && !form.url.trim()) {
      setError("HTTP / SSE 模式需要填写 URL");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(formToPayload(form));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "保存失败，请重试");
    } finally {
      setSaving(false);
    }
  }

  const inputCls =
    "flex h-8 w-full rounded-xl border border-border/50 bg-muted/50 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-1 focus:ring-primary/20";
  const textareaCls =
    "w-full rounded-xl border border-border/50 bg-muted/50 px-3 py-2 text-xs text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-primary/60 focus:ring-1 focus:ring-primary/20 font-mono resize-none";
  const labelCls = "mb-1 block text-xs font-medium text-muted-foreground";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name & display name */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>名称 *</label>
          <input
            className={inputCls}
            placeholder="my-fs-server"
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls}>显示名称</label>
          <input
            className={inputCls}
            placeholder="文件系统"
            value={form.display_name}
            onChange={(e) => set("display_name", e.target.value)}
          />
        </div>
      </div>

      {/* Transport selector */}
      <div>
        <label className={labelCls}>传输类型</label>
        <div className="flex gap-2">
          {(["stdio", "http", "sse"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => set("transport", t)}
              className={cn(
                "flex-1 rounded-xl border py-1.5 text-xs font-medium transition-colors",
                form.transport === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/50 bg-muted/30 text-muted-foreground hover:text-foreground"
              )}
            >
              {t === "stdio" ? "stdio（本地进程）" : t === "http" ? "HTTP（推荐）" : "SSE（旧版）"}
            </button>
          ))}
        </div>
        {form.transport === "http" && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            适用于大多数现代远程 MCP 服务器（如 Excalidraw、Notion 等）
          </p>
        )}
        {form.transport === "sse" && (
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            适用于旧版 SSE 协议服务器，一般优先尝试 HTTP
          </p>
        )}
      </div>

      {/* Transport-specific fields */}
      {form.transport === "stdio" ? (
        <>
          <div>
            <label className={labelCls}>命令 *</label>
            <input
              className={inputCls}
              placeholder="npx"
              value={form.command}
              onChange={(e) => set("command", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>参数（每行一个）</label>
            <textarea
              className={textareaCls}
              rows={3}
              placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/path/to/dir"}
              value={form.args}
              onChange={(e) => set("args", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>环境变量（JSON 对象，可选）</label>
            <textarea
              className={textareaCls}
              rows={2}
              placeholder={'{"API_KEY": "xxx"}'}
              value={form.env_vars}
              onChange={(e) => set("env_vars", e.target.value)}
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className={labelCls}>
              {form.transport === "http" ? "HTTP URL *" : "SSE URL *"}
            </label>
            <input
              className={inputCls}
              placeholder={
                form.transport === "http"
                  ? "https://mcp.excalidraw.com/mcp"
                  : "http://localhost:3000/sse"
              }
              value={form.url}
              onChange={(e) => set("url", e.target.value)}
            />
          </div>
          <div>
            <label className={labelCls}>请求头（JSON 对象，可选）</label>
            <textarea
              className={textareaCls}
              rows={2}
              placeholder={'{"Authorization": "Bearer xxx"}'}
              value={form.headers}
              onChange={(e) => set("headers", e.target.value)}
            />
          </div>
        </>
      )}

      {error && (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-border/50 px-4 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {saving && <Loader2 size={12} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

// ── Test result panel ──────────────────────────────────────────────────────────

function TestResultPanel({
  result,
  onClose,
}: {
  result: MCPTestResult;
  onClose: () => void;
}) {
  return (
    <div className="mt-3 rounded-xl border border-border/50 bg-muted/10 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {result.ok ? (
            <CheckCircle size={13} className="text-emerald-400" />
          ) : (
            <Unplug size={13} className="text-red-400" />
          )}
          <span className="text-xs font-medium">
            {result.ok ? `连接成功，发现 ${result.tools.length} 个工具` : "连接失败"}
          </span>
        </div>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X size={13} />
        </button>
      </div>
      {result.error && (
        <p className="mb-2 rounded-lg bg-red-500/10 px-2 py-1 text-xs text-red-400">
          {result.error}
        </p>
      )}
      {result.tools.length > 0 && (
        <div className="space-y-1">
          {result.tools.map((tool) => (
            <div key={tool.name} className="flex items-start gap-2">
              <Zap size={11} className="mt-0.5 flex-shrink-0 text-primary/60" />
              <div className="min-w-0">
                <span className="text-xs font-medium text-foreground">{tool.name}</span>
                {tool.description && (
                  <p className="text-[10px] text-muted-foreground line-clamp-1">
                    {tool.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Server row ─────────────────────────────────────────────────────────────────

function ServerRow({
  server,
  onToggle,
  onEdit,
  onDelete,
  onRefresh,
}: {
  server: MCPServer;
  onToggle: (id: string, enabled: boolean) => Promise<void>;
  onEdit: (server: MCPServer) => void;
  onDelete: (id: string) => Promise<void>;
  onRefresh: (updated: MCPServer) => void;
}) {
  const [testResult, setTestResult] = useState<MCPTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function handleTest() {
    setTesting(true);
    try {
      const { testMCPServer, listMCPServers } = await import("@/services/mcp-service");
      const result = await testMCPServer(server.id);
      setTestResult(result);
      // Refresh this server's data (discovered_tools was updated in DB on success)
      if (result.ok) {
        const updated = await listMCPServers();
        const fresh = updated.find((s) => s.id === server.id);
        if (fresh) onRefresh(fresh);
      }
    } catch {
      setTestResult({ ok: false, tools: [], error: "请求失败" });
    } finally {
      setTesting(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`确认删除 MCP 服务器「${server.displayName || server.name}」？`)) return;
    setDeleting(true);
    try {
      await onDelete(server.id);
    } finally {
      setDeleting(false);
    }
  }

  async function handleToggle() {
    setToggling(true);
    try {
      await onToggle(server.id, !server.isEnabled);
    } finally {
      setToggling(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/50 bg-muted/10 px-4 py-3 transition-colors hover:bg-muted/20">
      <div className="flex items-center gap-3">
        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {server.displayName || server.name}
            </span>
            <Badge
              className={
                server.transport === "stdio"
                  ? "bg-blue-500/15 text-blue-400"
                  : server.transport === "http"
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-violet-500/15 text-violet-400"
              }
            >
              {server.transport}
            </Badge>
            {!server.isEnabled && (
              <Badge className="bg-muted text-muted-foreground">已禁用</Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {server.transport === "stdio"
              ? `${server.command ?? ""} ${(server.args ?? []).join(" ")}`.trim() || "—"
              : server.url ?? "—"}
          </p>
          {server.discoveredTools && server.discoveredTools.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {server.discoveredTools.slice(0, 5).map((tool) => (
                <span
                  key={tool.name}
                  title={tool.description || tool.name}
                  className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                >
                  {tool.name}
                </span>
              ))}
              {server.discoveredTools.length > 5 && (
                <span className="rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  +{server.discoveredTools.length - 5} 个工具
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1 rounded-lg border border-border/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
          >
            {testing ? <Loader2 size={11} className="animate-spin" /> : <Unplug size={11} />}
            测试
          </button>
          <button
            type="button"
            onClick={() => onEdit(server)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
          >
            <Edit2 size={12} />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-50"
          >
            {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
          </button>
          {/* Enable toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={server.isEnabled}
            onClick={handleToggle}
            disabled={toggling}
            className={cn(
              "relative ml-1 inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 disabled:opacity-60",
              server.isEnabled ? "bg-primary" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200",
                server.isEnabled ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </div>
      </div>

      {testResult && (
        <TestResultPanel result={testResult} onClose={() => setTestResult(null)} />
      )}
    </div>
  );
}

// ── Main section ───────────────────────────────────────────────────────────────

type Dialog = { mode: "create" } | { mode: "edit"; server: MCPServer };

export function MCPSection() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    import("@/services/mcp-service")
      .then(({ listMCPServers }) =>
        listMCPServers()
          .then(setServers)
          .catch(() => {})
          .finally(() => setLoading(false))
      );
  }, []);

  async function handleCreate(payload: CreateMCPServerPayload) {
    const { createMCPServer } = await import("@/services/mcp-service");
    const created = await createMCPServer(payload);
    setServers((prev) => [...prev, created]);
    setDialog(null);
  }

  async function handleEdit(payload: CreateMCPServerPayload) {
    if (dialog?.mode !== "edit") return;
    const { updateMCPServer } = await import("@/services/mcp-service");
    const updated = await updateMCPServer(dialog.server.id, payload as import("@/services/mcp-service").UpdateMCPServerPayload);
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setDialog(null);
  }

  async function handleToggle(id: string, enabled: boolean) {
    const { updateMCPServer } = await import("@/services/mcp-service");
    const updated = await updateMCPServer(id, { is_enabled: enabled });
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  function handleRefresh(updated: MCPServer) {
    setServers((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function handleDelete(id: string) {
    const { deleteMCPServer } = await import("@/services/mcp-service");
    await deleteMCPServer(id);
    setServers((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 text-left"
          >
            {expanded ? (
              <ChevronDown size={13} className="text-muted-foreground" />
            ) : (
              <ChevronRight size={13} className="text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              MCP 服务器（{servers.length}）
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setDialog({ mode: "create" })}
          className="flex items-center gap-1 rounded-xl border border-border/50 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          <Plus size={11} />
          添加服务器
        </button>
      </div>

      <p className="text-xs text-muted-foreground">
        配置外部 MCP 工具服务器，AI 助手将在对话时自动发现并调用其中的工具。
      </p>

      {/* Server list */}
      {expanded && (
        <>
          {loading ? (
            <div className="flex justify-center py-6">
              <Loader2 size={18} className="animate-spin text-muted-foreground" />
            </div>
          ) : servers.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              暂无 MCP 服务器，点击「添加服务器」开始配置
            </p>
          ) : (
            <div className="space-y-2">
              {servers.map((s) => (
                <ServerRow
                  key={s.id}
                  server={s}
                  onToggle={handleToggle}
                  onEdit={(srv) => setDialog({ mode: "edit", server: srv })}
                  onDelete={handleDelete}
                  onRefresh={handleRefresh}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Create / edit dialog overlay */}
      {dialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setDialog(null)}
          />
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                {dialog.mode === "create" ? "添加 MCP 服务器" : "编辑 MCP 服务器"}
              </h3>
              <button
                type="button"
                onClick={() => setDialog(null)}
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent/60 hover:text-foreground"
              >
                <X size={13} />
              </button>
            </div>
            <MCPServerForm
              initial={
                dialog.mode === "edit" ? serverToForm(dialog.server) : BLANK_FORM
              }
              onSubmit={dialog.mode === "create" ? handleCreate : handleEdit}
              onClose={() => setDialog(null)}
              submitLabel={dialog.mode === "create" ? "添加" : "保存"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
