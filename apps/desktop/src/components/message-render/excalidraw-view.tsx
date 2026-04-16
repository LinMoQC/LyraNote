"use client"

/**
 * @file Excalidraw 画布渲染组件
 * @description 动态加载 Excalidraw 并将 MCP 工具返回的元素数据渲染为可交互白板画布，
 *              过滤非法元素类型后渲染，支持暗色主题。
 */

import dynamic from "next/dynamic"
import { useTranslations } from "next-intl"
import type { MCPResultData } from "@/types"

function ExcalidrawLoading() {
  const t = useTranslations("genui")
  return (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground animate-pulse">
      {t("excalidrawLoading")}
    </div>
  )
}

// Dynamic import avoids SSR issues with Excalidraw's browser-only APIs
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  {
    ssr: false,
    loading: () => <ExcalidrawLoading />,
  }
)

// Renderable Excalidraw element types — excludes MCP-internal commands like cameraUpdate
const EXCALIDRAW_ELEMENT_TYPES = new Set([
  "rectangle", "ellipse", "diamond", "arrow", "line",
  "text", "image", "freedraw", "frame",
])

interface ExcalidrawViewProps {
  data: MCPResultData
}

/** Extract renderable Excalidraw elements from an mcp_result payload.
 *  Handles both flat {"type":"excalidraw__create_view","props":{...}} and
 *  wrapped {"type":"group","components":[...]} structures. */
function extractElements(data: unknown): { elements: Record<string, unknown>[], appState: Record<string, unknown> } {
  const empty = { elements: [], appState: {} }
  if (!data || typeof data !== "object") return empty

  function findExcalidrawNode(node: Record<string, unknown>): Record<string, unknown> | null {
    if (typeof node.type === "string" && node.type.startsWith("excalidraw__")) return node
    const components = node.components
    if (Array.isArray(components)) {
      for (const child of components) {
        if (child && typeof child === "object") {
          const found = findExcalidrawNode(child as Record<string, unknown>)
          if (found) return found
        }
      }
    }
    return null
  }

  const node = findExcalidrawNode(data as Record<string, unknown>)
  if (!node) return empty

  const props = (node.props && typeof node.props === "object") ? node.props as Record<string, unknown> : {}
  const rawElements = Array.isArray(props.elements) ? props.elements : []
  const elements = rawElements.filter(
    (el): el is Record<string, unknown> =>
      el !== null && typeof el === "object" && EXCALIDRAW_ELEMENT_TYPES.has((el as Record<string, unknown>).type as string)
  )
  const appState = (props.appState && typeof props.appState === "object") ? props.appState as Record<string, unknown> : {}
  return { elements, appState }
}

export function ExcalidrawView({ data }: ExcalidrawViewProps) {
  const t = useTranslations("genui")
  const { elements, appState } = extractElements(data.data)

  return (
    <div className="mt-3 rounded-xl border border-border/60 overflow-hidden bg-background shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        <span className="text-sm font-medium text-foreground/80">
          {t("excalidrawTitle")}
          {elements.length > 0 && (
            <span className="ml-1.5 text-xs text-muted-foreground">{t("excalidrawElements", { count: elements.length })}</span>
          )}
        </span>
      </div>
      <div style={{ height: 480 }}>
        <Excalidraw
          initialData={{
            elements: elements as never[],
            appState: { viewBackgroundColor: "transparent", ...appState },
          }}
          viewModeEnabled
        />
      </div>
    </div>
  )
}
