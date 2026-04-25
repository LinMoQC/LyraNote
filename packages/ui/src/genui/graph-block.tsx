"use client"

import { memo, useRef, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { safeParseJSON } from "./utils"
import { GenUIStreamingPlaceholder } from "./genui-streaming-placeholder"

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false })

// 每种 group 对应的颜色与中文标签
const GROUP_META: Record<string, { color: string; label: string }> = {
  framework:  { color: "#6366f1", label: "框架" },
  concept:    { color: "#60a5fa", label: "概念" },
  capability: { color: "#34d399", label: "能力" },
  method:     { color: "#fbbf24", label: "方法" },
  tool:       { color: "#f87171", label: "工具" },
}
const DEFAULT_COLOR = "#6366f1"

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

// 画布上绘制节点（圆 + 文字标签）
function paintNode(node: Record<string, unknown>, ctx: CanvasRenderingContext2D) {
  const x = node.x as number
  const y = node.y as number
  // 节点坐标在 force simulation 初始化时可能为 undefined / NaN，跳过
  if (!isFinite(x) || !isFinite(y)) return
  const label = String(node.name ?? node.id ?? "")
  const group = String(node.group ?? "")
  const color = GROUP_META[group]?.color ?? DEFAULT_COLOR

  const RADIUS = 6

  // 光晕效果
  ctx.beginPath()
  const grd = ctx.createRadialGradient(x, y, 0, x, y, RADIUS * 2.5)
  grd.addColorStop(0, color + "55")
  grd.addColorStop(1, "transparent")
  ctx.fillStyle = grd
  ctx.arc(x, y, RADIUS * 2.5, 0, 2 * Math.PI)
  ctx.fill()

  // 节点圆
  ctx.beginPath()
  ctx.arc(x, y, RADIUS, 0, 2 * Math.PI)
  ctx.fillStyle = color
  ctx.shadowColor = color
  ctx.shadowBlur = 8
  ctx.fill()
  ctx.shadowBlur = 0

  // 节点标签
  ctx.font = "600 5.5px Inter, sans-serif"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.fillText(label, x, y + RADIUS + 5.5)
}

// 画布上绘制边标签（居中、半透明背景）
function paintLink(
  link: Record<string, unknown>,
  ctx: CanvasRenderingContext2D,
) {
  const label = String(link.label ?? "")
  if (!label) return

  const src = link.source as Record<string, unknown>
  const tgt = link.target as Record<string, unknown>
  if (!isFinite(src.x as number) || !isFinite(tgt.x as number)) return

  const mx = ((src.x as number) + (tgt.x as number)) / 2
  const my = ((src.y as number) + (tgt.y as number)) / 2

  ctx.font = "500 4px Inter, sans-serif"
  const w = ctx.measureText(label).width

  // 背景胶囊（手动实现圆角矩形，兼容旧版 Chromium）
  const rx = mx - w / 2 - 3
  const ry = my - 4
  const rw = w + 6
  const rh = 8
  const r = 3
  ctx.fillStyle = "rgba(15,15,26,0.75)"
  ctx.beginPath()
  ctx.moveTo(rx + r, ry)
  ctx.lineTo(rx + rw - r, ry)
  ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r)
  ctx.lineTo(rx + rw, ry + rh - r)
  ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh)
  ctx.lineTo(rx + r, ry + rh)
  ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r)
  ctx.lineTo(rx, ry + r)
  ctx.quadraticCurveTo(rx, ry, rx + r, ry)
  ctx.closePath()
  ctx.fill()

  // 文字
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillStyle = "rgba(255,255,255,0.65)"
  ctx.fillText(label, mx, my)
}

function GraphBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null)
  const [width, setWidth] = useState(500)

  // 监听容器宽度，实现自适应
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setWidth(Math.floor(w))
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  if (isStreaming) return <GenUIStreamingPlaceholder />

  const data = safeParseJSON<GraphData>(code)
  if (!data || !Array.isArray(data.nodes) || !Array.isArray(data.edges)) {
    return (
      <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5">
        <code>{code}</code>
      </pre>
    )
  }

  // 提取本次数据中实际出现的 group，用于渲染图例
  const presentGroups = [...new Set(data.nodes.map((n) => n.group).filter(Boolean))] as string[]

  const graphData = {
    nodes: data.nodes.map((n) => ({ ...n, name: n.id })),
    links: data.edges.map((e) => ({ source: e.from, target: e.to, label: e.label })),
  }

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-border/40 bg-[#0f0f1a]">
      {/* 图例 */}
      {presentGroups.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-white/5 px-4 py-2">
          {presentGroups.map((g) => {
            const meta = GROUP_META[g]
            return (
              <span key={g} className="flex items-center gap-1.5 text-[11px] text-white/50">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: meta?.color ?? DEFAULT_COLOR }}
                />
                {meta?.label ?? g}
              </span>
            )
          })}
        </div>
      )}

      {/* 图谱 */}
      <div ref={containerRef} className="w-full">
        <ForceGraph2D
          graphData={graphData}
          // 节点：自定义画布绘制（圆 + 标签）
          nodeCanvasObject={(node: unknown, ctx: CanvasRenderingContext2D) =>
            paintNode(node as Record<string, unknown>, ctx)
          }
          nodeCanvasObjectMode={() => "replace"}
          // 边：颜色与箭头
          linkColor={() => "rgba(255,255,255,0.18)"}
          linkWidth={0.8}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          // 边标签：自定义画布绘制
          linkCanvasObject={(link: unknown, ctx: CanvasRenderingContext2D) =>
            paintLink(link as Record<string, unknown>, ctx)
          }
          linkCanvasObjectMode={() => "after"}
          width={width}
          height={380}
          backgroundColor="transparent"
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          nodeLabel=""
          ref={fgRef}
          onEngineStop={() => {
            // simulation 稳定后微调：让节点分散更开
            const fg = fgRef.current
            if (!fg) return
            fg.d3Force("charge")?.strength(-400)
            fg.d3Force("link")?.distance(120)
            fg.d3ReheatSimulation()
          }}
        />
      </div>
    </div>
  )
}

export const GraphBlock = memo(GraphBlockInner)
