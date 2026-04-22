import CharacterCount from "@tiptap/extension-character-count"
import Highlight from "@tiptap/extension-highlight"
import Link from "@tiptap/extension-link"
import Placeholder from "@tiptap/extension-placeholder"
import TaskItem from "@tiptap/extension-task-item"
import TaskList from "@tiptap/extension-task-list"
import Underline from "@tiptap/extension-underline"
import StarterKit from "@tiptap/starter-kit"

export const desktopTiptapExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
  }),
  Underline,
  Highlight.configure({ multicolor: false }),
  Link.configure({
    openOnClick: false,
    HTMLAttributes: { class: "text-[var(--color-accent)] underline underline-offset-2" },
  }),
  Placeholder.configure({
    placeholder: "开始书写...",
    emptyEditorClass: "is-editor-empty",
  }),
  CharacterCount,
  TaskList,
  TaskItem.configure({ nested: true }),
]
