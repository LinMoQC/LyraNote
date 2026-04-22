"use client"

/**
 * @file Draw.io 架构图嵌入组件
 * @description 将 DiagramData（XML 格式）渲染为嵌入式 Draw.io 画布，
 *              支持查看/编辑模式切换，编辑完成后回写 XML 数据。
 */

import { useRef, useState } from "react"
import { DrawIoEmbed } from "react-drawio"
import type { DrawIoEmbedRef } from "react-drawio"
import { useTranslations } from "next-intl"
import type { DiagramData } from "@lyranote/types"

interface DiagramViewProps {
  data: DiagramData
}

export function DiagramView({ data }: DiagramViewProps) {
  const t = useTranslations("genui")
  const [isLoaded, setIsLoaded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const drawioRef = useRef<DrawIoEmbedRef>(null)

  const xml = wrapXml(data.xml)

  return (
    <div className="mt-3 rounded-xl border border-border/60 overflow-hidden bg-background shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        <span className="text-sm font-medium text-foreground/80 truncate">
          📐 {data.title || t("diagramTitle")}
        </span>
        <button
          type="button"
          onClick={() => setIsEditing((v) => !v)}
          className="flex-shrink-0 rounded-md px-2.5 py-1 text-xs font-medium transition-colors
            bg-primary/10 text-primary hover:bg-primary/20"
        >
          {isEditing ? t("diagramEditDone") : t("diagramEdit")}
        </button>
      </div>

      {/* Diagram */}
      <div className="relative" style={{ height: isEditing ? 680 : 560 }}>
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20 z-10">
            <span className="text-sm text-muted-foreground animate-pulse">{t("diagramLoading")}</span>
          </div>
        )}
        <DrawIoEmbed
          ref={drawioRef}
          xml={xml}
          urlParameters={{
            ui: "kennedy",
            spin: true,
            // view mode: hide editing chrome; edit mode: show full editor without save/exit btns
            ...(isEditing
              ? { noSaveBtn: true, noExitBtn: true }
              : { chrome: false, nav: true }),
          }}
          onLoad={() => setIsLoaded(true)}
        />
      </div>
    </div>
  )
}

/**
 * Wraps raw mxCell elements in a complete mxfile structure if they aren't already.
 */
function wrapXml(xml: string): string {
  const trimmed = xml.trim()
  if (trimmed.startsWith("<mxfile")) return trimmed
  if (trimmed.startsWith("<mxGraphModel")) {
    return `<mxfile><diagram name="Page-1" id="page-1">${trimmed}</diagram></mxfile>`
  }
  return `<mxfile><diagram name="Page-1" id="page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${trimmed}</root></mxGraphModel></diagram></mxfile>`
}
