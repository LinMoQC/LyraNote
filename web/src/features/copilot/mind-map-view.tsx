"use client"

import { useEffect, useRef, useState } from "react"
import { GitBranch, ChevronDown, ChevronRight } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MindMapData, MindMapNode } from "@/types"

function applyMarkmapDarkTheme() {
  const existing = document.getElementById("markmap-dark-override")
  if (existing) existing.remove() // always re-inject so it stays last in cascade
  const el = document.createElement("style")
  el.id = "markmap-dark-override"
  el.textContent = `
    svg.markmap { color: #f0f0f5; }
    svg.markmap g.markmap-node text {
      fill: #f0f0f5 !important;
      color: #f0f0f5 !important;
      font-size: 13px !important;
      font-weight: 500 !important;
    }
    svg.markmap path.markmap-link {
      stroke: rgba(255,255,255,0.28) !important;
    }
    svg.markmap circle {
      stroke-width: 1.5 !important;
      fill-opacity: 0.9 !important;
    }
  `
  document.head.appendChild(el)
}

/** Export mind map as a readable Markdown outline for editor insertion */
export function mindMapToMarkdown(data: MindMapData): string {
  const lines: string[] = [`## ${data.title}`, ""]
  for (const branch of data.branches) {
    lines.push(`### ${branch.label}`)
    for (const child of branch.children ?? []) {
      lines.push(`- ${child.label}`)
      for (const leaf of child.children ?? []) {
        lines.push(`  - ${leaf.label}`)
      }
    }
    lines.push("")
  }
  return lines.join("\n")
}

/** Convert our JSON tree → Markdown outline that markmap understands */
function toMarkdown(data: MindMapData): string {
  const lines: string[] = [`# ${data.title}`]

  function walk(nodes: MindMapNode[], depth: number) {
    for (const node of nodes) {
      lines.push(`${"#".repeat(depth + 1)} ${node.label}`)
      if (node.children?.length) walk(node.children, depth + 1)
    }
  }

  walk(data.branches, 1)
  return lines.join("\n")
}

const MIN_HEIGHT = 220
const MAX_HEIGHT = 900
// Temp height given to SVG so fit() can compute a proper viewBox
const RENDER_HEIGHT = 600

export function MindMapView({ data }: { data: MindMapData }) {
  const t = useTranslations("copilot")
  const tc = useTranslations("common")
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)
  const [svgHeight, setSvgHeight] = useState(0)

  useEffect(() => {
    if (collapsed) return
    let cancelled = false

    async function render() {
      if (!svgRef.current || !wrapperRef.current) return
      try {
        const { Transformer } = await import("markmap-lib")
        const { Markmap, loadCSS, loadJS } = await import("markmap-view")

        if (cancelled || !svgRef.current) return

        const transformer = new Transformer()
        const md = toMarkdown(data)
        const { root, features } = transformer.transform(md)

        const { styles, scripts } = transformer.getUsedAssets(features)
        if (styles) await loadCSS(styles)
        if (scripts) await loadJS(scripts, { getMarkmap: () => ({ Markmap }) })

        svgRef.current.innerHTML = ""
        svgRef.current.classList.add("markmap")

        const containerW = wrapperRef.current.clientWidth || 460
        // Give SVG enough width; height will be computed after layout
        svgRef.current.style.width = `${containerW}px`
        svgRef.current.style.height = `${RENDER_HEIGHT}px`

        const palette = ["#818cf8", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa"]
        const mm = Markmap.create(svgRef.current, {
          color: (node: unknown) => palette[((node as { depth?: number }).depth ?? 0) % palette.length],
          duration: 0, // disable animation during measurement pass
          paddingX: 16,
          spacingVertical: 8,
          spacingHorizontal: 60,
          fitRatio: 0.92,
          maxWidth: 240,
        })

        // setData triggers D3 layout — nodes get coordinates BEFORE fit()
        mm.setData(root)

        // Wait two frames for the browser to finish the SVG layout pass
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))

        if (cancelled || !svgRef.current) return

        // Read NATURAL content bounds from the root <g> BEFORE fit() applies transforms
        let finalH = MIN_HEIGHT
        const rootG = svgRef.current.querySelector<SVGGElement>("g")
        if (rootG) {
          const bbox = rootG.getBBox() // local coords, unaffected by any transform
          if (bbox.width > 0 && bbox.height > 0) {
            // Scale content so it fits container width at fitRatio
            const scale = (containerW * 0.92) / bbox.width
            const needed = Math.ceil(bbox.height * scale) + 48
            finalH = Math.max(MIN_HEIGHT, Math.min(needed, MAX_HEIGHT))
          }
        }

        // Set final SVG size, then fit into it
        svgRef.current.style.height = `${finalH}px`
        if (!cancelled) setSvgHeight(finalH)

        await mm.fit()
        // Re-enable animation for user interactions (expand/collapse)
        ;(mm as unknown as { options: { duration: number } }).options.duration = 300

        applyMarkmapDarkTheme()

        svgRef.current?.querySelectorAll("text").forEach((t) => {
          t.style.fill = "#f0f0f5"
          t.setAttribute("fill", "#f0f0f5")
        })
        svgRef.current?.querySelectorAll("path.markmap-link").forEach((p) => {
          ;(p as SVGElement).style.stroke = "rgba(255,255,255,0.28)"
        })

        if (!cancelled) setReady(true)
      } catch (err) {
        console.error("[MindMap] render error", err)
      }
    }

    setReady(false)
    void render()
    return () => { cancelled = true }
  }, [data, collapsed])

  return (
    <div className="mt-2 overflow-hidden rounded-2xl border border-border/40 bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
        <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-violet-500/20">
          <GitBranch size={11} className="text-violet-400" />
        </div>
        <span className="flex-1 truncate text-xs font-semibold text-foreground/90">{data.title}</span>
        <span className="text-[10px] text-muted-foreground/40">{t("mindMapBranches", { count: data.branches.length })}</span>

        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="rounded p-0.5 text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
          title={collapsed ? tc("expand") : tc("collapse")}
        >
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
      </div>

      {/* SVG canvas */}
      {!collapsed && (
        <div
          ref={wrapperRef}
          className="relative overflow-hidden transition-[height] duration-300"
          style={{ height: ready && svgHeight ? svgHeight : 72 }}
        >
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] text-muted-foreground/40">{t("rendering")}</span>
            </div>
          )}
          {/* SVG height is managed via inline style in the render effect */}
          <svg
            ref={svgRef}
            style={{ opacity: ready ? 1 : 0, transition: "opacity 0.4s", display: "block" }}
          />
        </div>
      )}
    </div>
  )
}
