"use client"

import { Node, mergeAttributes } from "@tiptap/core"
import { ReactNodeViewRenderer, NodeViewWrapper } from "@tiptap/react"
import { useMemo } from "react"
import {
  safeParseJSON,
  TableBlock,
  ChartBlock,
  CardBlock,
  FormulaBlock,
  PaperCardBlock,
  QuizBlock,
  TimelineBlock,
  StepsBlock,
  DiffBlock,
  MatrixBlock,
  KanbanBlock,
  GraphBlock,
  WordCloudBlock,
  HeatmapBlock,
} from "@lyranote/ui/genui"

// ── Types ─────────────────────────────────────────────────────────────────────

interface GenUIPayload {
  type: string
  props?: Record<string, unknown>
  components?: GenUIPayload[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getGenUIProps(
  parsed: GenUIPayload,
): Record<string, unknown> | undefined {
  if (parsed.props !== undefined)
    return parsed.props as Record<string, unknown>
  const {
    type: _type,
    components: _components,
    props: _props,
    ...rest
  } = parsed
  return Object.keys(rest).length > 0 ? rest : undefined
}

/** Infer genui type from data shape when no explicit `type` field is present. */
function inferType(data: Record<string, unknown>): string | null {
  if ((data.columns || data.headers) && (data.rows || data.data)) return "table"
  if (data.chartType || data.xAxis || data.series) return "chart"
  if (data.xKey || data.yKey || data.yKeys) return "chart"
  if (Array.isArray(data.items)) return "card"
  if (typeof data.content === "string") return "text-card"
  if (Array.isArray(data.events) || Array.isArray(data.nodes)) return "timeline"
  if (Array.isArray(data.steps)) return "steps"
  return null
}

function renderByType(type: string, code: string, props?: Record<string, unknown>): React.ReactNode {
  switch (type) {
    case "chart":
      return <ChartBlock code={code} />
    case "table":
      return <TableBlock code={code} />
    case "card":
      return <CardBlock code={code} />
    case "formula":
      return (
        <FormulaBlock
          code={
            typeof props === "object" && props !== null
              ? String(props.content ?? "")
              : ""
          }
        />
      )
    case "paper-card":
      return <PaperCardBlock code={code} />
    case "quiz":
      return <QuizBlock code={code} />
    case "timeline":
      return <TimelineBlock code={code} />
    case "steps":
      return <StepsBlock code={code} />
    case "diff":
      return <DiffBlock code={code} />
    case "matrix":
      return <MatrixBlock code={code} />
    case "kanban":
      return <KanbanBlock code={code} />
    case "graph":
      return <GraphBlock code={code} />
    case "wordcloud":
      return <WordCloudBlock code={code} />
    case "heatmap":
      return <HeatmapBlock code={code} />
    case "text-card": {
      const cardData = {
        title: String(props?.title ?? ""),
        items: [{ label: "", value: String(props?.content ?? "") }],
      }
      return <CardBlock code={JSON.stringify(cardData)} />
    }
    default:
      return null
  }
}

function renderGenUI(parsed: Record<string, unknown>): React.ReactNode {
  const explicitType = typeof parsed.type === "string" ? parsed.type : null

  if (explicitType) {
    const props = getGenUIProps(parsed as GenUIPayload)
    const code = JSON.stringify(props ?? {})
    return renderByType(explicitType, code, props)
  }

  // No explicit type — auto-detect from data shape and pass full JSON as code
  const inferred = inferType(parsed)
  if (inferred) {
    const code = JSON.stringify(parsed)
    return renderByType(inferred, code, parsed)
  }

  return null
}

// ── Node View ─────────────────────────────────────────────────────────────────

function GenUINodeView({ node }: { node: { attrs: { code: string } } }) {
  const raw = node.attrs.code

  const element = useMemo(() => {
    const parsed = safeParseJSON<Record<string, unknown>>(raw)
    if (!parsed || Array.isArray(parsed)) return null
    return renderGenUI(parsed)
  }, [raw])

  if (!element) {
    return (
      <NodeViewWrapper>
        <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5">
          <code>{raw}</code>
        </pre>
      </NodeViewWrapper>
    )
  }

  return (
    <NodeViewWrapper>
      <div contentEditable={false} className="my-1">
        {element}
      </div>
    </NodeViewWrapper>
  )
}

// ── Extension ─────────────────────────────────────────────────────────────────

export const GenUIBlockExtension = Node.create({
  name: "genuiBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      code: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-genui-code") ?? "",
        renderHTML: (attrs) => ({ "data-genui-code": attrs.code }),
      },
    }
  },

  parseHTML() {
    return [{ tag: "div[data-genui-code]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-genui-block": "" }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      GenUINodeView as unknown as Parameters<typeof ReactNodeViewRenderer>[0],
    )
  },
})
