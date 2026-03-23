export function safeParseJSON<T>(code: string): T | null {
  try { return JSON.parse(code) as T }
  catch { return null }
}

/**
 * Extract artifact-html content from potentially malformed JSON.
 * The AI sometimes produces JSON where the HTML content has escaping issues
 * that break JSON.parse. This does a best-effort regex extraction.
 */
export function extractArtifactHtml(text: string): string | null {
  if (!text.includes('"artifact-html"')) return null

  // Try to find the "content" field value
  const marker = '"content"'
  const idx = text.indexOf(marker)
  if (idx < 0) return null

  const colonIdx = text.indexOf(":", idx + marker.length)
  if (colonIdx < 0) return null

  // Find the opening quote of the value
  const valueStart = text.indexOf('"', colonIdx + 1)
  if (valueStart < 0) return null

  // Walk forward to find the matching close quote, handling escapes
  let i = valueStart + 1
  let result = ""
  while (i < text.length) {
    if (text[i] === "\\" && i + 1 < text.length) {
      const next = text[i + 1]
      if (next === "n") { result += "\n"; i += 2; continue }
      if (next === "t") { result += "\t"; i += 2; continue }
      if (next === '"') { result += '"'; i += 2; continue }
      if (next === "\\") { result += "\\"; i += 2; continue }
      if (next === "/") { result += "/"; i += 2; continue }
      result += text[i]
      i++
      continue
    }
    if (text[i] === '"') break
    result += text[i]
    i++
  }

  return result || null
}
