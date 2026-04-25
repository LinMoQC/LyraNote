import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import type { Editor } from "@tiptap/react"
import { cn } from "@/lib/cn"

interface HeadingItem {
  id: string
  level: 1 | 2 | 3
  text: string
  pos: number
  index: number
}

function useEditorHeadings(editor: Editor | null): HeadingItem[] {
  const [headings, setHeadings] = useState<HeadingItem[]>([])

  useEffect(() => {
    if (!editor) return

    const extract = () => {
      const items: HeadingItem[] = []
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading" && node.textContent.trim()) {
          items.push({
            id: `h-${pos}`,
            level: node.attrs.level as 1 | 2 | 3,
            text: node.textContent,
            pos,
            index: items.length,
          })
        }
      })
      setHeadings(items)
    }

    extract()
    editor.on("update", extract)
    return () => { editor.off("update", extract) }
  }, [editor])

  return headings
}

function useActiveHeading(
  editor: Editor | null,
  headings: HeadingItem[],
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!editor || !headings.length) return

    const update = () => {
      const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null
      const scrollTop = scrollParent?.scrollTop ?? 0
      const scrollHeight = scrollParent?.scrollHeight ?? 0
      const clientHeight = scrollParent?.clientHeight ?? 0

      if (scrollTop < 50) {
        setActiveId(headings[0].id)
        return
      }

      if (scrollHeight - scrollTop - clientHeight < 40) {
        setActiveId(headings[headings.length - 1].id)
        return
      }

      const allHeadings = Array.from(
        editor.view.dom.querySelectorAll("h1,h2,h3"),
      )
      const containerTop = editor.view.dom.getBoundingClientRect().top

      let active = headings[0].id
      for (let i = 0; i < headings.length; i++) {
        const el = allHeadings[headings[i].index] as HTMLElement | undefined
        if (!el) continue
        if (el.getBoundingClientRect().top - containerTop <= scrollTop + 120) {
          active = headings[i].id
        }
      }
      setActiveId(active)
    }

    const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null
    scrollParent?.addEventListener("scroll", update, { passive: true })
    update()
    return () => scrollParent?.removeEventListener("scroll", update)
  }, [editor, headings])

  return activeId
}

function useReadingProgress(editor: Editor | null): number {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    if (!editor) return
    const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null
    if (!scrollParent) return

    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollParent
      const max = scrollHeight - clientHeight
      setProgress(max <= 0 ? 100 : Math.round((scrollTop / max) * 100))
    }

    scrollParent.addEventListener("scroll", update, { passive: true })
    update()
    return () => scrollParent.removeEventListener("scroll", update)
  }, [editor])

  return progress
}

export function EditorTOC({ editor }: { editor: Editor | null }) {
  const headings = useEditorHeadings(editor)
  const activeId = useActiveHeading(editor, headings)
  const progress = useReadingProgress(editor)
  const containerRef = useRef<HTMLDivElement>(null)

  const scrollToHeading = (h: HeadingItem) => {
    if (!editor) return
    try {
      const scrollParent = editor.view.dom.closest(".overflow-y-auto") as HTMLElement | null
      if (h.index === 0) {
        scrollParent?.scrollTo({ top: 0, behavior: "smooth" })
        return
      }
      const allHeadings = Array.from(
        editor.view.dom.querySelectorAll("h1, h2, h3"),
      )
      const el = allHeadings[h.index] as HTMLElement | undefined
      if (!el) return
      if (scrollParent) {
        const parentRect = scrollParent.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        scrollParent.scrollTo({
          top: scrollParent.scrollTop + elRect.top - parentRect.top - 80,
          behavior: "smooth",
        })
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" })
      }
    } catch { /* detached node */ }
  }

  useEffect(() => {
    if (!activeId || !containerRef.current) return
    const activeEl = containerRef.current.querySelector(`[data-active="true"]`) as HTMLElement | null
    if (activeEl) {
      const container = containerRef.current
      const targetScrollTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.offsetHeight / 2
      container.scrollTop = Math.max(0, targetScrollTop)
    }
  }, [activeId])

  if (!headings.length) return null

  return (
    <div className="relative flex w-[180px] shrink-0 flex-col overflow-hidden my-8 mr-4 rounded-2xl border border-white/[0.06] bg-white/[0.015]">
      {/* Scrollable heading list */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-1 pt-4 pb-2 no-scrollbar"
        style={{ maxHeight: "45vh" }}
      >
        <nav className="relative flex flex-col">
          {headings.map((h) => {
            const isActive = activeId === h.id
            return (
              <button
                key={h.id}
                type="button"
                data-active={isActive ? "true" : "false"}
                onClick={() => scrollToHeading(h)}
                className={cn(
                  "group relative flex w-full cursor-pointer items-start py-[6px] pr-4 text-left transition-all duration-200",
                  h.level === 1 && "pl-5",
                  h.level === 2 && "pl-8",
                  h.level === 3 && "pl-11",
                  isActive && "bg-violet-400/10 rounded-sm",
                )}
              >
                {isActive && (
                  <div className="absolute left-[18px] top-[10px] h-3.5 w-[2.5px] -translate-x-[1px] rounded-full bg-violet-400 shadow-[0_0_10px_rgba(167,139,250,0.6)] z-10" />
                )}

                <span
                  className={cn(
                    "line-clamp-2 leading-[1.45] transition-all duration-200",
                    h.level === 1 && "text-[12px] font-medium tracking-tight",
                    h.level === 2 && "text-[12px] font-normal",
                    h.level === 3 && "text-[11.5px] font-normal",
                    isActive
                      ? "translate-x-1 font-medium text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-tertiary)] group-hover:translate-x-0.5 group-hover:text-[var(--color-text-secondary)]",
                  )}
                >
                  {h.text}
                </span>
              </button>
            )
          })}
        </nav>
      </div>

      {/* Footer: progress + back to top */}
      <div className="flex items-center px-4 pt-3 pb-4 border-t border-white/[0.04]">
        <div className="flex items-center gap-1">
          <div className="relative h-4 w-4 flex-shrink-0">
            <svg className="h-4 w-4 -rotate-90" viewBox="0 0 16 16">
              <circle cx="8" cy="8" r="6" fill="none" strokeWidth="1.5" className="stroke-white/[0.06]" />
              <circle
                cx="8" cy="8" r="6"
                fill="none"
                strokeWidth="2"
                strokeLinecap="round"
                className="stroke-violet-400/80 transition-all duration-500 ease-out"
                strokeDasharray={`${2 * Math.PI * 6}`}
                strokeDashoffset={`${2 * Math.PI * 6 * (1 - progress / 100)}`}
              />
            </svg>
          </div>
          <span className="text-[11px] font-medium tabular-nums tracking-wider text-[var(--color-text-tertiary)] opacity-60">
            {progress}%
          </span>
        </div>

        <div className="ml-auto pr-1">
          <AnimatePresence>
            {progress > 5 && (
              <motion.button
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 5 }}
                onClick={() => {
                  const scrollParent = editor?.view.dom.closest(".overflow-y-auto") as HTMLElement | null
                  scrollParent?.scrollTo({ top: 0, behavior: "smooth" })
                }}
                className="flex items-center gap-1 text-[var(--color-text-tertiary)] transition-colors hover:text-violet-400"
              >
                <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M8 12V4M8 4L4 8M8 4L12 8" />
                </svg>
                <span className="text-[10px] font-medium leading-none">回到顶部</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
