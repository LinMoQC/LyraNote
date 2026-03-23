"use client"

import { memo } from "react"
import dynamic from "next/dynamic"
import { safeParseJSON } from "./utils"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

const GROUP_COLORS: Record<string, string> = {
  framework: "#6366f1",
  concept: "#60a5fa",
  capability: "#34d399",
  method: "#fbbf24",
  tool: "#f87171",
}

interface GraphNode {
  id: string
  group?: string
}

interface GraphEdge {
  from: string
  to: string
  label?: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

function GraphBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  if (isStreaming) {
    return (
      <div className="my-3 flex h-64 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        正在生成关系图...
      </div>
    )
  }

  const data = safeParseJSON<GraphData>(code)
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  const graphData = {
    nodes: data.nodes.map((n) => ({ ...n, name: n.id })),
    links: data.edges.map((e) => ({ source: e.from, target: e.to, label: e.label })),
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/40 bg-[#0f0f1a]">
      <ForceGraph2D
        graphData={graphData}
        nodeLabel="name"
        nodeColor={(n: Record<string, unknown>) => GROUP_COLORS[String(n.group ?? "")] ?? "#6366f1"}
        linkLabel="label"
        linkColor={() => "rgba(255,255,255,0.15)"}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        width={500}
        height={320}
        backgroundColor="transparent"
      />
    </div>
  )
}

export const GraphBlock = memo(GraphBlockInner)
