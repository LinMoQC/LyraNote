/**
 * Markdown → Tiptap JSON document converter.
 * Used when saving deep-research reports as notes so that headings, lists,
 * code blocks, and genui blocks are preserved as structured Tiptap nodes
 * rather than dumped as raw text.
 */

interface TiptapMark {
  type: string
  attrs?: Record<string, unknown>
}

interface TiptapNode {
  type: string
  attrs?: Record<string, unknown>
  content?: TiptapNode[]
  marks?: TiptapMark[]
  text?: string
}

/** Parse inline markdown (**bold**, *italic*, `code`, [text](url)) into Tiptap text nodes with marks. */
function processInline(text: string): TiptapNode[] {
  const nodes: TiptapNode[] = []
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)]+\))/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) })
    }

    const seg = match[0]
    if (seg.startsWith("**") && seg.endsWith("**")) {
      nodes.push({ type: "text", text: seg.slice(2, -2), marks: [{ type: "bold" }] })
    } else if (seg.startsWith("`") && seg.endsWith("`")) {
      nodes.push({ type: "text", text: seg.slice(1, -1), marks: [{ type: "code" }] })
    } else if (seg.startsWith("*") && seg.endsWith("*")) {
      nodes.push({ type: "text", text: seg.slice(1, -1), marks: [{ type: "italic" }] })
    } else {
      const lm = seg.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/)
      if (lm) {
        nodes.push({
          type: "text",
          text: lm[1],
          marks: [{ type: "link", attrs: { href: lm[2] } }],
        })
      }
    }

    lastIndex = match.index + seg.length
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) })
  }

  return nodes.filter((n) => n.text && n.text.length > 0)
}

/** Build a paragraph node from a raw text line. */
function makeParagraph(text: string): TiptapNode {
  const inline = processInline(text)
  return { type: "paragraph", content: inline.length > 0 ? inline : undefined }
}

/**
 * Convert a Markdown string to a Tiptap JSON document.
 * Handles headings, paragraphs, bullet/ordered lists, blockquotes,
 * code blocks, horizontal rules, and `genui` fenced blocks.
 */
export function markdownToTiptapDoc(md: string): Record<string, unknown> {
  const lines = md.split(/\r?\n/)
  const content: TiptapNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimEnd()

    // ── ATX headings ──────────────────────────────────────────
    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (hMatch) {
      const level = hMatch[1].length
      const inline = processInline(hMatch[2].trim())
      if (inline.length > 0) {
        content.push({ type: "heading", attrs: { level }, content: inline })
      }
      i++
      continue
    }

    // ── Horizontal rule ───────────────────────────────────────
    if (/^[-*]{3,}$/.test(trimmed)) {
      content.push({ type: "horizontalRule" })
      i++
      continue
    }

    // ── Blockquote ────────────────────────────────────────────
    if (trimmed.trimStart().startsWith(">")) {
      const quoteContent: TiptapNode[] = []
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        const qText = lines[i].trimStart().replace(/^>\s?/, "").trim()
        if (qText) {
          quoteContent.push(makeParagraph(qText))
        }
        i++
      }
      if (quoteContent.length > 0) {
        content.push({ type: "blockquote", content: quoteContent })
      }
      continue
    }

    // ── Fenced code block ─────────────────────────────────────
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim()
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i])
        i++
      }
      if (i < lines.length) i++ // consume closing ```

      const codeText = codeLines.join("\n")

      if (lang === "genui") {
        content.push({ type: "genuiBlock", attrs: { code: codeText } })
      } else {
        const node: TiptapNode = {
          type: "codeBlock",
          attrs: { language: lang || null },
        }
        if (codeText) {
          node.content = [{ type: "text", text: codeText }]
        }
        content.push(node)
      }
      continue
    }

    // ── Unordered list ────────────────────────────────────────
    if (/^[-*]\s+/.test(trimmed)) {
      const items: TiptapNode[] = []
      while (i < lines.length) {
        const bullet = lines[i].match(/^\s*[-*]\s+(.*)$/)
        if (bullet) {
          items.push({ type: "listItem", content: [makeParagraph(bullet[1].trim())] })
          i++
        } else if (lines[i].trim() === "") {
          i++
        } else {
          break
        }
      }
      if (items.length > 0) {
        content.push({ type: "bulletList", content: items })
      }
      continue
    }

    // ── Ordered list ──────────────────────────────────────────
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: TiptapNode[] = []
      while (i < lines.length) {
        const bullet = lines[i].match(/^\s*\d+\.\s+(.*)$/)
        if (bullet) {
          items.push({ type: "listItem", content: [makeParagraph(bullet[1].trim())] })
          i++
        } else if (lines[i].trim() === "") {
          i++
        } else {
          break
        }
      }
      if (items.length > 0) {
        content.push({ type: "orderedList", content: items })
      }
      continue
    }

    // ── Blank line ────────────────────────────────────────────
    if (trimmed === "") {
      i++
      continue
    }

    // ── Paragraph (consecutive non-structural lines) ─────────
    const pLines: string[] = []
    while (i < lines.length && lines[i].trimEnd() !== "") {
      const l = lines[i]
      if (/^#{1,3}\s+/.test(l.trimEnd())) break
      if (l.trimStart().startsWith(">")) break
      if (l.trim().startsWith("```")) break
      if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) break
      if (/^[-*]{3,}$/.test(l.trimEnd())) break
      pLines.push(l)
      i++
    }

    if (pLines.length > 0) {
      // Join multi-line paragraphs with hard breaks
      const nodes: TiptapNode[] = []
      for (let j = 0; j < pLines.length; j++) {
        if (j > 0) nodes.push({ type: "hardBreak" })
        nodes.push(...processInline(pLines[j]))
      }
      if (nodes.length > 0) {
        content.push({ type: "paragraph", content: nodes })
      }
    } else {
      i++ // safety: prevent infinite loop
    }
  }

  if (content.length === 0) {
    content.push({ type: "paragraph" })
  }

  return { type: "doc", content }
}
