"use client"

import { AnimatePresence, m } from "framer-motion"
import { Code2, Eye, Loader2, X } from "lucide-react"
import { memo, useEffect, useMemo, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { ArtifactPayload } from "./markdown-components"

function highlightHtml(code: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /(<!--[\s\S]*?-->)|(<\/?[\w-]+)|(\s[\w-]+(?:=)?)|(=\s*"[^"]*")|(\/>|>)|(&\w+;)/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = re.exec(code)) !== null) {
    if (match.index > lastIndex) parts.push(code.slice(lastIndex, match.index))
    const [full, comment, tag, attr, value, close, entity] = match
    if (comment)    parts.push(<span key={match.index} className="text-[#565f89]">{full}</span>)
    else if (tag)   parts.push(<span key={match.index} className="text-[#7aa2f7]">{full}</span>)
    else if (attr)  parts.push(<span key={match.index} className="text-[#bb9af7]">{full}</span>)
    else if (value) parts.push(<span key={match.index} className="text-[#9ece6a]">{full}</span>)
    else if (close) parts.push(<span key={match.index} className="text-[#7aa2f7]">{full}</span>)
    else if (entity) parts.push(<span key={match.index} className="text-[#ff9e64]">{full}</span>)
    else parts.push(full)
    lastIndex = match.index + full.length
  }
  if (lastIndex < code.length) parts.push(code.slice(lastIndex))
  return parts
}

interface ArtifactPanelProps {
  artifact: ArtifactPayload | null
  onClose: () => void
}

function ArtifactPanelInner({ artifact, onClose }: ArtifactPanelProps) {
  const t = useTranslations("genui")
  const [tab, setTab] = useState<"preview" | "source">("source")
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const codeRef = useRef<HTMLPreElement>(null)
  const [iframeReady, setIframeReady] = useState(false)

  const srcDoc = useMemo(() => {
    if (!artifact) return ""
    return artifact.content
  }, [artifact])

  const highlighted = useMemo(() => {
    if (!artifact?.content) return null
    return highlightHtml(artifact.content)
  }, [artifact?.content])

  useEffect(() => {
    if (codeRef.current) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight
    }
  }, [artifact?.content])

  useEffect(() => {
    if (tab === "preview" && srcDoc) {
      setIframeReady(false)
    }
  }, [tab, srcDoc])

  return (
    <AnimatePresence>
      {artifact && (
        <m.div
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-white/[0.08] bg-white/[0.04] shadow-2xl"
        >
          <div className="flex items-center gap-3 border-b border-white/[0.08] px-4 py-3">
            <h3 className="flex-1 truncate text-sm font-medium text-white/80">
              {artifact.title}
            </h3>
            <div className="flex rounded-lg bg-white/[0.05] p-0.5">
              <button
                type="button"
                onClick={() => setTab("preview")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all",
                  tab === "preview" ? "bg-white/[0.04] text-white/90 shadow-sm" : "text-white/40 hover:text-white/80"
                )}
              >
                <Eye size={12} />
                {t("artifactPreview")}
              </button>
              <button
                type="button"
                onClick={() => setTab("source")}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-all",
                  tab === "source" ? "bg-white/[0.04] text-white/90 shadow-sm" : "text-white/40 hover:text-white/80"
                )}
              >
                <Code2 size={12} />
                {t("artifactSource")}
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/[0.07] hover:text-white/90"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {tab === "preview" ? (
              <div className="relative h-full w-full">
                {!iframeReady && (
                  <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/[0.04]">
                    <Loader2 size={24} className="animate-spin text-indigo-400" />
                    <span className="text-xs text-white/40">{t("artifactLoadingPreview")}</span>
                  </div>
                )}
                <iframe
                  ref={iframeRef}
                  srcDoc={srcDoc}
                  sandbox="allow-scripts"
                  className="h-full w-full border-0 bg-white"
                  title={artifact.title}
                  onLoad={() => setIframeReady(true)}
                />
              </div>
            ) : (
              <pre
                ref={codeRef}
                className="h-full overflow-auto bg-[#1a1b26] p-4 font-mono text-xs leading-6 text-[#c0caf5]"
              >
                <code>{highlighted}</code>
              </pre>
            )}
          </div>
        </m.div>
      )}
    </AnimatePresence>
  )
}

export const ArtifactPanel = memo(ArtifactPanelInner)
