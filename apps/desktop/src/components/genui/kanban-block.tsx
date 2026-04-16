"use client"

import { memo, useCallback, useMemo, useState } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { safeParseJSON } from "./utils"

interface KanbanCard {
  id: string
  title: string
  tag?: string
}

interface KanbanColumn {
  id: string
  title: string
  cards: KanbanCard[]
}

interface KanbanData {
  columns: KanbanColumn[]
}

function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const TAG_COLORS: Record<string, string> = {
  "必读": "bg-red-500/15 text-red-300",
  "扩展": "bg-blue-500/15 text-blue-300",
  "进行中": "bg-amber-500/15 text-amber-300",
  "已读": "bg-emerald-500/15 text-emerald-300",
}

function SortableCard({ card }: { card: KanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: card.id })
  const style = { transform: CSS.Transform.toString(transform), transition }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "cursor-grab rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2 text-xs transition-shadow",
        isDragging && "opacity-50 shadow-lg"
      )}
    >
      <p className="font-medium text-white/80">{card.title}</p>
      {card.tag && (
        <span className={cn("mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px]", TAG_COLORS[card.tag] ?? "bg-indigo-500/15 text-indigo-300")}>
          {card.tag}
        </span>
      )}
    </div>
  )
}

function KanbanBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  const t = useTranslations("genui")
  if (isStreaming) {
    return (
      <div className="my-3 flex h-32 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-xs text-white/40">
        {t("kanbanStreaming")}
      </div>
    )
  }

  const parsed = safeParseJSON<KanbanData>(code)
  if (!parsed || !Array.isArray(parsed.columns)) return <pre className="my-2 overflow-x-auto rounded-xl bg-white/[0.06] p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  const storageKey = `lyra-kanban-${hashCode(code)}`

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [columns, setColumns] = useState<KanbanColumn[]>(() => {
    if (typeof window === "undefined") return parsed.columns
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) return JSON.parse(saved) as KanbanColumn[]
    } catch { /* ignore */ }
    return parsed.columns
  })

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const allCardIds = useMemo(() => columns.flatMap((col) => col.cards.map((c) => c.id)), [columns])

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setColumns((prev) => {
      const next = prev.map((col) => ({ ...col, cards: [...col.cards] }))
      let sourceCol: KanbanColumn | undefined
      let sourceIdx = -1
      let card: KanbanCard | undefined

      for (const col of next) {
        const idx = col.cards.findIndex((c) => c.id === active.id)
        if (idx !== -1) { sourceCol = col; sourceIdx = idx; card = col.cards[idx]; break }
      }
      if (!sourceCol || !card) return prev
      sourceCol.cards.splice(sourceIdx, 1)

      let targetCol: KanbanColumn | undefined
      let targetIdx = -1
      for (const col of next) {
        const idx = col.cards.findIndex((c) => c.id === over.id)
        if (idx !== -1) { targetCol = col; targetIdx = idx; break }
      }
      if (!targetCol) {
        targetCol = next.find((col) => col.id === String(over.id))
        targetIdx = targetCol ? targetCol.cards.length : 0
      }
      if (!targetCol) { sourceCol.cards.splice(sourceIdx, 0, card); return prev }

      targetCol.cards.splice(targetIdx, 0, card)

      try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [storageKey])

  return (
    <div className="my-3 flex gap-3 overflow-x-auto rounded-xl border border-white/[0.08] bg-white/[0.03] p-4">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={allCardIds} strategy={verticalListSortingStrategy}>
          {columns.map((col) => (
            <div key={col.id} className="flex w-48 shrink-0 flex-col gap-2">
              <h5 className="text-xs font-semibold text-white/70">
                {col.title}
                <span className="ml-1 text-white/30">({col.cards.length})</span>
              </h5>
              <div className="flex flex-col gap-1.5">
                {col.cards.map((card) => <SortableCard key={card.id} card={card} />)}
              </div>
            </div>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  )
}

export const KanbanBlock = memo(KanbanBlockInner)
