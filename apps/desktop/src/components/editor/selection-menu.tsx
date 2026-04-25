import { BubbleMenu } from "@tiptap/react"
import type { Editor } from "@tiptap/react"
import {
  Bold,
  Code,
  Eraser,
  Italic,
  Link2,
  MoreHorizontal,
  Strikethrough,
  Underline,
} from "lucide-react"
import { useRef, useState } from "react"

import { cn } from "@/lib/cn"

interface SelectionMenuProps {
  editor: Editor | null
}

export function SelectionMenu({ editor }: SelectionMenuProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const linkInputRef = useRef<HTMLInputElement>(null)

  if (!editor) return null

  function openLinkInput() {
    const prev = editor!.getAttributes("link").href as string | undefined
    setLinkUrl(prev ?? "")
    setShowLinkInput(true)
    setTimeout(() => linkInputRef.current?.select(), 30)
  }

  function commitLink() {
    const url = linkUrl.trim()
    if (url === "") {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run()
    } else {
      const href = url.startsWith("http") ? url : `https://${url}`
      editor!.chain().focus().extendMarkRange("link").setLink({ href }).run()
    }
    setShowLinkInput(false)
    setLinkUrl("")
  }

  return (
    <BubbleMenu
      editor={editor}
      tippyOptions={{
        duration: [0, 0],
        animation: false,
        placement: "bottom-start",
        offset: [0, 14],
        zIndex: 40,
        interactive: true,
        onMount(instance) {
          const box = instance.popper.firstElementChild as HTMLElement | null
          if (!box) return
          box.style.transition = "none"
          box.style.transform = "scale(0.94) translateY(-5px)"
          box.style.opacity = "0"
          requestAnimationFrame(() => {
            box.style.transition =
              "transform 300ms cubic-bezier(0.34,1.56,0.64,1), opacity 180ms ease"
            box.style.transform = "scale(1) translateY(0)"
            box.style.opacity = "1"
          })
        },
        onHide(instance) {
          const box = instance.popper.firstElementChild as HTMLElement | null
          if (!box) return
          box.style.transition = "transform 110ms cubic-bezier(0.4,0,1,1), opacity 90ms ease"
          box.style.transform = "scale(0.95) translateY(-4px)"
          box.style.opacity = "0"
        },
      }}
      shouldShow={({ editor: ae, state }) => {
        const { selection } = state
        if ("node" in selection) return false  // NodeSelection
        if (selection.empty) return false
        return ae.isEditable
      }}
      className="overflow-hidden rounded-[12px] border border-white/10 bg-[#252525] p-2 text-white shadow-[0_4px_20px_rgba(0,0,0,0.6)]"
    >
      <div className="flex w-[192px] flex-col">
        {showLinkInput ? (
          /* ── Link input panel ──────────────────────── */
          <div className="flex flex-col gap-2 py-0.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] font-medium text-white/40">链接</span>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  editor.chain().focus().extendMarkRange("link").unsetLink().run()
                  setShowLinkInput(false)
                  setLinkUrl("")
                }}
                className="rounded-[4px] px-1.5 py-0.5 text-[11px] text-red-400/60 transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                移除
              </button>
            </div>

            <div className="flex items-center gap-1.5 rounded-[8px] border border-white/10 bg-white/[0.04] px-2.5 py-1.5 transition-colors focus-within:border-white/20 focus-within:bg-white/[0.06]">
              <Link2 size={13} className="shrink-0 text-white/30" />
              <input
                ref={linkInputRef}
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); commitLink() }
                  if (e.key === "Escape") { e.preventDefault(); setShowLinkInput(false); setLinkUrl("") }
                }}
                placeholder="https://"
                className="min-w-0 flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-white/25"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={commitLink}
                className="flex-1 rounded-[6px] bg-[var(--color-accent)]/20 py-1.5 text-[12px] font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/30"
              >
                确认
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { setShowLinkInput(false); setLinkUrl("") }}
                className="flex-1 rounded-[6px] border border-white/8 py-1.5 text-[12px] text-white/50 transition-colors hover:bg-white/[0.05]"
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Row 1: T A B I U ───────────────────── */}
            <div className="flex gap-[2px]">
              <FormatButton label="正文" onClick={() => editor.chain().focus().setParagraph().run()} active={false}>
                <span className="text-[13px] font-semibold leading-none">T</span>
              </FormatButton>
              <FormatButton label="高亮" onClick={() => editor.chain().focus().toggleHighlight().run()} active={editor.isActive("highlight")}>
                <span className="rounded-[4px] px-[5px] py-[3px] text-[11px] font-semibold leading-none shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]">A</span>
              </FormatButton>
              <FormatButton label="粗体" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
                <Bold size={15} strokeWidth={2.4} />
              </FormatButton>
              <FormatButton label="斜体" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
                <Italic size={15} />
              </FormatButton>
              <FormatButton label="下划线" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
                <Underline size={15} />
              </FormatButton>
            </div>

            {/* ── Row 2: Link Strike Code Clear More ── */}
            <div className="flex gap-[2px]">
              <FormatButton label="链接" onClick={openLinkInput} active={editor.isActive("link")}>
                <Link2 size={15} />
              </FormatButton>
              <FormatButton label="删除线" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
                <Strikethrough size={15} />
              </FormatButton>
              <FormatButton label="代码" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
                <Code size={15} />
              </FormatButton>
              <FormatButton label="清除格式" onClick={() => editor.chain().focus().unsetAllMarks().run()}>
                <Eraser size={15} />
              </FormatButton>
              <FormatButton label="更多" onClick={() => {}} active={false}>
                <MoreHorizontal size={15} />
              </FormatButton>
            </div>
          </>
        )}
      </div>
    </BubbleMenu>
  )
}

function FormatButton({
  active = false,
  children,
  disabled = false,
  label,
  onClick,
}: {
  active?: boolean
  children: React.ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
}) {
  return (
    <div className="group/btn relative flex-1">
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={cn(
          "flex h-7 w-full items-center justify-center rounded-[6px] text-white/80 transition-colors duration-75",
          active ? "bg-white/[0.14] text-white" : "hover:bg-white/[0.08] hover:text-white",
          disabled && "cursor-not-allowed opacity-40",
        )}
      >
        {children}
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-[calc(100%+6px)] left-1/2 z-[999] -translate-x-1/2 opacity-0 transition-opacity delay-500 duration-150 group-hover/btn:opacity-100">
        <div className="whitespace-nowrap rounded-[6px] bg-[#111] px-2 py-1 text-[11px] font-medium text-white/90 shadow-lg">
          {label}
        </div>
        <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[4px] border-x-transparent border-t-[#111]" />
      </div>
    </div>
  )
}
