/**
 * Minimal Markdown → HTML for inserting AI content into Tiptap.
 * Pure synchronous function — designed to run inside a Web Worker so it never blocks the main thread.
 * Escapes HTML to prevent XSS.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Inline: **bold**, *italic*, `code`, [text](url). Non-backtracking patterns only. */
function processInline(text: string): string {
  let out = escapeHtml(text)
  // **bold** first — avoids interference with single *
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  // *italic* — [^*]+ prevents backtracking on strings with many asterisks
  out = out.replace(/\*([^*]+)\*/g, "<em>$1</em>")
  // `inline code`
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>")
  // [text](url)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g,
    (_, t, u) => `<a href="${escapeHtml(u)}">${escapeHtml(t)}</a>`
  )
  return out
}

/**
 * Convert a Markdown string to HTML suitable for Tiptap's insertContent().
 * Run this inside a Web Worker to avoid blocking the main thread on large inputs.
 */
export function markdownToHtml(md: string): string {
  const lines = md.split(/\r?\n/)
  const blocks: string[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trimEnd()

    // ATX headings: #, ##, ###
    const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/)
    if (hMatch) {
      const level = hMatch[1].length
      blocks.push(`<h${level}>${processInline(hMatch[2].trim())}</h${level}>`)
      i++
      continue
    }

    // Horizontal rule: --- or ***
    if (/^[-*]{3,}$/.test(trimmed)) {
      blocks.push("<hr>")
      i++
      continue
    }

    // Blockquote: > ... (with optional leading whitespace)
    if (trimmed.trimStart().startsWith(">")) {
      const quoteLines: string[] = []
      while (i < lines.length && lines[i].trimStart().startsWith(">")) {
        quoteLines.push(processInline(lines[i].trimStart().replace(/^>\s?/, "").trim()))
        i++
      }
      blocks.push(`<blockquote><p>${quoteLines.join("</p><p>")}</p></blockquote>`)
      continue
    }

    // Fenced code block: ```lang
    if (trimmed.startsWith("```")) {
      const lang = trimmed.slice(3).trim() || ""
      i++
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(escapeHtml(lines[i]))
        i++
      }
      if (i < lines.length) i++ // consume closing ```
      blocks.push(
        `<pre><code class="language-${escapeHtml(lang)}">${codeLines.join("\n")}</code></pre>`
      )
      continue
    }

    // Unordered list: - item / * item
    // Ordered list: 1. item
    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const listTag = /^\d+\.\s+/.test(trimmed) ? "ol" : "ul"
      const items: string[] = []
      while (i < lines.length) {
        const l = lines[i]
        const ulBullet = l.match(/^\s*[-*]\s+(.*)$/)
        const olBullet = l.match(/^\s*\d+\.\s+(.*)$/)
        if (ulBullet) {
          items.push(`<li>${processInline(ulBullet[1].trim())}</li>`)
          i++
        } else if (olBullet) {
          items.push(`<li>${processInline(olBullet[1].trim())}</li>`)
          i++
        } else if (l.trim() === "") {
          i++
        } else {
          break
        }
      }
      blocks.push(`<${listTag}>${items.join("")}</${listTag}>`)
      continue
    }

    // Skip blank lines
    if (trimmed === "") {
      i++
      continue
    }

    // Paragraph: consume consecutive non-structural lines
    const pLines: string[] = []
    while (i < lines.length && lines[i].trimEnd() !== "") {
      const l = lines[i]
      if (/^#{1,3}\s+/.test(l.trimEnd())) break
      if (l.trimStart().startsWith(">")) break
      if (l.trim().startsWith("```")) break
      if (/^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l)) break
      pLines.push(processInline(l))
      i++
    }
    if (pLines.length) {
      blocks.push(`<p>${pLines.join("<br>")}</p>`)
    } else {
      // Safety: if nothing was consumed, advance i to prevent infinite loop
      i++
    }
  }

  return blocks.join("")
}
