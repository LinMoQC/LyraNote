"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useEffect, useRef, useState } from "react"
import { GitBranch, GripVertical, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"
import type { MindMapData } from "@/types"
import { mindMapToMarkdown } from "@/features/copilot/mind-map-view"

// ── React node view ──────────────────────────────────────────────────────────

function ensureGlobalDarkStyle() {
  const existing = document.getElementById("markmap-dark-override")
  if (existing) existing.remove()
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

const MIN_H = 200
const MAX_H = 900

function MindMapNodeView({ node, deleteNode, selected }: {
  node: { attrs: { data: string } }
  deleteNode: () => void
  selected: boolean
}) {
  const t = useTranslations("copilot")
  const tCommon = useTranslations("common")
  const svgRef = useRef<SVGSVGElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)
  const [svgHeight, setSvgHeight] = useState(0)

  const data: MindMapData | null = (() => {
    try { return JSON.parse(node.attrs.data) } catch { return null }
  })()

  useEffect(() => {
    if (!data || !svgRef.current) return
    let cancelled = false

    async function render() {
      if (!svgRef.current || !data) return
      try {
        const { Transformer } = await import("markmap-lib")
        const { Markmap, loadCSS, loadJS } = await import("markmap-view")
        if (cancelled || !svgRef.current) return

        const transformer = new Transformer()
        const { root, features } = transformer.transform(mindMapToMarkdown(data))
        const { styles, scripts } = transformer.getUsedAssets(features)
        if (styles) await loadCSS(styles)
        if (scripts) await loadJS(scripts, { getMarkmap: () => ({ Markmap }) })

        svgRef.current.innerHTML = ""
        svgRef.current.classList.add("markmap")

        const containerW = wrapperRef.current?.clientWidth || 600
        // Give SVG enough room so D3 layout uses full width
        svgRef.current.style.width = `${containerW}px`
        svgRef.current.style.height = "600px"

        const palette = ["#818cf8", "#38bdf8", "#34d399", "#fbbf24", "#f87171", "#a78bfa"]
        const mm = Markmap.create(svgRef.current, {
          color: (n) => palette[((n as unknown as { depth: number }).depth ?? 0) % palette.length],
          duration: 0, // disable during measurement
          paddingX: 14,
          spacingVertical: 8,
          spacingHorizontal: 60,
          fitRatio: 0.92,
          maxWidth: 240,
        })

        // setData triggers D3 layout — nodes get coordinates before fit()
        mm.setData(root)

        // Wait two frames for browser to finish SVG layout
        await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
        if (cancelled || !svgRef.current) return

        // Read NATURAL content bounds from root <g> BEFORE fit() applies transforms
        let finalH = MIN_H
        const rootG = svgRef.current.querySelector<SVGGElement>("g")
        if (rootG) {
          const bbox = rootG.getBBox()
          if (bbox.width > 0 && bbox.height > 0) {
            const scale = (containerW * 0.92) / bbox.width
            const needed = Math.ceil(bbox.height * scale) + 48
            finalH = Math.max(MIN_H, Math.min(needed, MAX_H))
          }
        }

        svgRef.current.style.height = `${finalH}px`
        if (!cancelled) setSvgHeight(finalH)

        await mm.fit()
        ;(mm as unknown as { options: { duration: number } }).options.duration = 300

        ensureGlobalDarkStyle()

        svgRef.current?.querySelectorAll("text").forEach((textEl) => {
          textEl.style.fill = "#f0f0f5"
          textEl.setAttribute("fill", "#f0f0f5")
        })
        svgRef.current?.querySelectorAll("path.markmap-link").forEach((p) => {
          ;(p as SVGElement).style.stroke = "rgba(255,255,255,0.28)"
        })

        if (!cancelled) setReady(true)
      } catch (err) {
        console.error("[MindMapNode] render error", err)
      }
    }

    setReady(false)
    void render()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.attrs.data])

  if (!data) return null

  return (
    <NodeViewWrapper>
      <div
        data-drag-handle
        className={`group relative my-3 overflow-hidden rounded-2xl border bg-card transition-all ${
          selected ? "border-violet-500/40 shadow-[0_0_0_2px_rgba(139,92,246,0.15)]" : "border-border/40"
        }`}
        contentEditable={false}
      >
        {/* Header */}
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-2">
          <GripVertical size={12} className="cursor-grab text-muted-foreground/30" />
          <div className="flex h-5 w-5 items-center justify-center rounded-md bg-violet-500/20">
            <GitBranch size={11} className="text-violet-400" />
          </div>
          <span className="flex-1 truncate text-xs font-semibold text-foreground/90">{data.title}</span>
          <span className="text-[10px] text-muted-foreground/40">{t("mindMapBranches", { count: data.branches.length })}</span>
          <button
            type="button"
            onClick={deleteNode}
            className="rounded p-0.5 text-muted-foreground/30 opacity-0 transition-all group-hover:opacity-100 hover:text-red-400"
            title={tCommon("delete")}
          >
            <Trash2 size={11} />
          </button>
        </div>

        {/* SVG canvas — height driven by natural content bounds */}
        <div
          ref={wrapperRef}
          className="relative overflow-hidden transition-[height] duration-300"
          style={{ height: ready && svgHeight ? svgHeight : 72 }}
        >
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-[11px] text-muted-foreground/40">{t("renderingShort")}</span>
            </div>
          )}
          <svg
            ref={svgRef}
            style={{ opacity: ready ? 1 : 0, transition: "opacity 0.4s", display: "block" }}
          />
        </div>
      </div>
    </NodeViewWrapper>
  )
}

// ── Tiptap extension ─────────────────────────────────────────────────────────

export const MindMapExtension = Node.create({
  name: "mindMap",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      data: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-mind-map") ?? null,
        renderHTML: (attrs) => ({ "data-mind-map": attrs.data as string }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-mind-map]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(MindMapNodeView as unknown as Parameters<typeof ReactNodeViewRenderer>[0])
  },
})
