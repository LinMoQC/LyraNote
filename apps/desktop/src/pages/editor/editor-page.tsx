import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Placeholder from "@tiptap/extension-placeholder"
import Highlight from "@tiptap/extension-highlight"
import TaskList from "@tiptap/extension-task-list"
import TaskItem from "@tiptap/extension-task-item"
import CharacterCount from "@tiptap/extension-character-count"
import {
  Bold, Italic, Strikethrough, Code, List, ListOrdered,
  Heading1, Heading2, Heading3, Quote, Undo, Redo,
  Highlighter, CheckSquare, Sparkles, ChevronLeft,
} from "lucide-react"
import { pageVariants, pageTransition, springs } from "@/lib/animations"
import { cn } from "@/lib/cn"
import { CopilotPanel } from "@/components/editor/copilot-panel"

interface EditorPageProps {
  title?: string
  notebookTitle?: string
  notebookId?: string
}

interface ToolbarButtonProps {
  onClick: () => void
  isActive?: boolean
  disabled?: boolean
  children: React.ReactNode
  title?: string
}

function ToolbarButton({ onClick, isActive, disabled, children, title }: ToolbarButtonProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center justify-center w-7 h-7 rounded-md transition-colors text-[13px]",
        isActive
          ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          : "text-[var(--color-text-secondary)] hover:bg-white/8 hover:text-[var(--color-text-primary)]",
        disabled && "opacity-30 pointer-events-none"
      )}
    >
      {children}
    </motion.button>
  )
}

export function EditorPage({ title = "无标题笔记", notebookTitle = "Lyra", notebookId }: EditorPageProps) {
  const [noteTitle, setNoteTitle] = useState(title)
  const [aiOpen, setAiOpen] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: "开始书写..." }),
      Highlight.configure({ multicolor: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      CharacterCount,
    ],
    editorProps: {
      attributes: { class: "tiptap" },
    },
  })

  if (!editor) return null

  const wordCount = editor.storage.characterCount?.words?.() ?? 0

  function getEditorContent(): string {
    if (!editor) return ""
    return `标题：${noteTitle}\n\n${editor.getText()}`
  }

  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
      className="flex flex-col h-full"
    >
      {/* Breadcrumb + toolbar */}
      <div
        className="flex items-center justify-between px-6 py-2 border-b shrink-0"
        style={{ borderColor: "var(--color-border)" }}
      >
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-tertiary)]">
          <ChevronLeft size={13} />
          <span>返回</span>
          <span>/</span>
          <span>{notebookTitle}</span>
          <span>/</span>
          <span className="text-[var(--color-text-secondary)]">{noteTitle}</span>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="撤销">
            <Undo size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="重做">
            <Redo size={14} />
          </ToolbarButton>

          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} isActive={editor.isActive("heading", { level: 1 })} title="标题1">
            <Heading1 size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} isActive={editor.isActive("heading", { level: 2 })} title="标题2">
            <Heading2 size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} isActive={editor.isActive("heading", { level: 3 })} title="标题3">
            <Heading3 size={14} />
          </ToolbarButton>

          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} isActive={editor.isActive("bold")} title="加粗">
            <Bold size={13} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} isActive={editor.isActive("italic")} title="斜体">
            <Italic size={13} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} isActive={editor.isActive("strike")} title="删除线">
            <Strikethrough size={13} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleCode().run()} isActive={editor.isActive("code")} title="行内代码">
            <Code size={13} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleHighlight().run()} isActive={editor.isActive("highlight")} title="高亮">
            <Highlighter size={13} />
          </ToolbarButton>

          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

          <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} isActive={editor.isActive("bulletList")} title="无序列表">
            <List size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} isActive={editor.isActive("orderedList")} title="有序列表">
            <ListOrdered size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleTaskList().run()} isActive={editor.isActive("taskList")} title="任务列表">
            <CheckSquare size={14} />
          </ToolbarButton>
          <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} isActive={editor.isActive("blockquote")} title="引用">
            <Quote size={14} />
          </ToolbarButton>

          <div className="w-px h-4 bg-[var(--color-border)] mx-1" />

          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setAiOpen((v) => !v)}
            className={cn(
              "flex items-center gap-1.5 px-3 h-7 rounded-lg text-[12px] font-medium transition-colors",
              aiOpen
                ? "bg-[var(--color-accent)] text-white"
                : "bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white"
            )}
          >
            <Sparkles size={13} />
            AI 帮写
          </motion.button>
        </div>

        {/* Word count */}
        <span className="text-[11px] text-[var(--color-text-tertiary)] min-w-[60px] text-right">
          {wordCount} 字
        </span>
      </div>

      {/* Main area */}
      <div className="flex flex-1 min-h-0">
        {/* Editor */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-[720px] mx-auto px-12 py-10">
            {/* Title */}
            <input
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="无标题"
              className="w-full bg-transparent outline-none text-[2rem] font-bold text-[var(--color-text-primary)] placeholder:text-[var(--color-text-tertiary)] mb-6 leading-tight"
              style={{ fontFamily: "var(--font-sans)" }}
            />
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* AI Copilot Panel */}
        <AnimatePresence>
          {aiOpen && (
            <motion.div
              key="ai-panel"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 300, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={springs.smooth}
              className="shrink-0 border-l flex flex-col overflow-hidden"
              style={{ borderColor: "var(--color-border)", background: "var(--color-bg-elevated)" }}
            >
              <CopilotPanel
                notebookId={notebookId}
                onClose={() => setAiOpen(false)}
                getEditorContent={getEditorContent}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}
