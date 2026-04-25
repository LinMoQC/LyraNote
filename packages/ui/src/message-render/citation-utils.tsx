import { Fragment, type ReactNode } from "react"

import type { CitationData } from "@lyranote/types"

import { InlineCitationBadge } from "./inline-citation"

export const CITATION_RE = /【来源(\d+)】|【(\d+)】|\[来源(\d+)\]|\[\[(\d+)\]\]|\[(\d+)\]/g

export function stripCitationMarkers(text: string): string {
  return text
    .replace(/【来源\d+】|【\d+】|\[来源\d+\]|\[\[\d+\]\]|\[\d+\]/g, "")
    .replace(/ {2,}/g, " ")
    .trim()
}

export function renderInlineCitations(text: string, citations?: CitationData[]): ReactNode {
  const parts: ReactNode[] = []
  let lastIdx = 0
  let match: RegExpExecArray | null

  CITATION_RE.lastIndex = 0
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index))
    const num = parseInt(match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5], 10)
    parts.push(
      <InlineCitationBadge key={`cite-${match.index}`} index={num} citation={citations?.[num - 1]} />,
    )
    lastIdx = match.index + match[0].length
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx))
  return parts.length > 1 ? <>{parts}</> : text
}

export function processChildren(children: ReactNode, citations?: CitationData[]): ReactNode {
  if (typeof children === "string") return renderInlineCitations(children, citations)
  if (Array.isArray(children)) {
    return children.map((child, i) => (
      <Fragment key={i}>{processChildren(child, citations)}</Fragment>
    ))
  }
  return children
}
