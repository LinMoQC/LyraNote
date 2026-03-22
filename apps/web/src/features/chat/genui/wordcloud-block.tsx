"use client"

import { memo } from "react"
import dynamic from "next/dynamic"
import { safeParseJSON } from "./utils"

const ReactWordcloud = dynamic(() => import("react-wordcloud"), { ssr: false })

interface WordcloudData {
  title?: string
  words: Array<{ text: string; weight: number }>
}

const WORDCLOUD_OPTIONS = {
  fontSizes: [14, 60] as [number, number],
  rotations: 2,
  rotationAngles: [0, -90] as [number, number],
  colors: ["#6366f1", "#818cf8", "#60a5fa", "#34d399", "#fbbf24", "#a78bfa"],
  fontFamily: "inherit",
  padding: 2,
  deterministic: true,
}

function WordCloudBlockInner({ code, isStreaming }: { code: string; isStreaming?: boolean }) {
  if (isStreaming) {
    return (
      <div className="my-3 flex h-48 items-center justify-center rounded-xl border border-border/40 bg-muted/20 text-xs text-muted-foreground/60">
        正在生成词云...
      </div>
    )
  }

  const data = safeParseJSON<WordcloudData>(code)
  if (!data || !Array.isArray(data.words)) return <pre className="my-2 overflow-x-auto rounded-xl bg-accent/60 p-3 font-mono text-xs leading-5"><code>{code}</code></pre>

  const words = data.words.map((w) => ({ text: w.text, value: w.weight }))

  return (
    <div className="my-3 rounded-xl border border-border/40 bg-muted/10 p-4">
      {data.title && <p className="mb-2 text-sm font-medium text-foreground/80">{data.title}</p>}
      <div style={{ height: 240 }}>
        <ReactWordcloud words={words} options={WORDCLOUD_OPTIONS} />
      </div>
    </div>
  )
}

export const WordCloudBlock = memo(WordCloudBlockInner)
