"use client";

/**
 * @file MCP 工具调用结果渲染组件
 * @description 提供两种 MCP 结果渲染视图：
 *   - MCPHTMLView：将 HTML 内容通过 Blob URL 注入沙盒 iframe 展示；
 *   - MCPResultCard：将 JSON 格式的工具返回数据以格式化卡片呈现。
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { MCPResultData } from "@lyranote/types";

/** Renders an MCP tool result HTML page inside a sandboxed iframe via a blob URL. */
export function MCPHTMLView({ data }: { data: MCPResultData }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data.html_content) return;
    const blob = new Blob([data.html_content], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [data.html_content]);

  if (!blobUrl) return null;

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border/60 shadow-sm">
      <div className="flex items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-1.5">
        <span className="text-sm font-medium text-foreground/70">🔌 {data.tool}</span>
      </div>
      <iframe
        src={blobUrl}
        className="w-full"
        style={{ height: 480, border: "none" }}
        sandbox="allow-scripts allow-same-origin"
        title={data.tool}
      />
    </div>
  );
}

/** Generic fallback card for MCP tool results without a specific renderer. */
export function MCPResultCard({ data }: { data: MCPResultData }) {
  const t = useTranslations("genui");
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-border/60 bg-background shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 border-b border-border/40 bg-muted/30 px-3 py-2 text-left"
      >
        <span className="text-sm font-medium text-foreground/80">
          🔌 {t("mcpResultLabel", { tool: data.tool })}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          {expanded ? t("mcpCollapse") : t("mcpExpand")}
        </span>
      </button>
      {expanded && (
        <pre className="max-h-64 overflow-auto bg-muted/20 p-3 text-xs text-foreground/80">
          {JSON.stringify(data.data, null, 2)}
        </pre>
      )}
    </div>
  );
}
