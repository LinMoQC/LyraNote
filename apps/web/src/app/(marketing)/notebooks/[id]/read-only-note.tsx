"use client";

import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";

const readOnlyExtensions = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline,
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Link.configure({
    openOnClick: true,
    HTMLAttributes: { class: "text-primary underline underline-offset-2 hover:opacity-75" },
  }),
];

export function ReadOnlyNote({
  content,
  noteId,
}: {
  content: Record<string, unknown>;
  noteId?: string;
}) {
  const editor = useEditor({
    extensions: readOnlyExtensions,
    content,
    editable: false,
    editorProps: {
      attributes: {
        class: "tiptap prose-sm max-w-none font-normal focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor || !noteId) return;
    const el = editor.options.element;
    if (!el) return;
    const parent = el.closest(".ProseMirror")?.parentElement ?? el;
    const headings = parent.querySelectorAll("h1, h2, h3");
    headings.forEach((h) => {
      const text = h.textContent?.trim() ?? "";
      if (text) {
        h.id = `heading-${noteId}-${text.slice(0, 20).replace(/\s+/g, "-")}`;
      }
    });
  }, [editor, noteId]);

  if (!editor) return null;

  return <EditorContent editor={editor} />;
}
