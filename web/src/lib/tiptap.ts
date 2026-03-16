import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";

import { t } from "@/lib/i18n";
import { GhostText } from "@/lib/tiptap-ghost-text";
import { MindMapExtension } from "@/lib/tiptap-mind-map";

export const tiptapExtensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] }
  }),
  Underline,
  Highlight.configure({ multicolor: false }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline underline-offset-2" } }),
  Placeholder.configure({
    placeholder: t("editor.startWriting", "Start writing…"),
    emptyEditorClass: "is-editor-empty"
  }),
  GhostText,
  MindMapExtension,
];
