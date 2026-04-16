/**
 * Stub for @/features/chat/chat-helpers used by message-render components.
 * Provides parseBold and re-exports processChildren from citation-utils.
 */

import type { ReactNode } from "react"

export { renderInlineCitations, processChildren } from "@/lib/citation-utils"

/**
 * Parses **bold** markdown syntax into <strong> elements.
 */
export function parseBold(text: string): ReactNode {
  const parts: ReactNode[] = []
  let lastIdx = 0
  const re = /\*\*(.+?)\*\*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index))
    parts.push(<strong key={m.index} className="font-semibold text-foreground">{m[1]}</strong>)
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length > 1 ? parts : parts[0] ?? text
}
