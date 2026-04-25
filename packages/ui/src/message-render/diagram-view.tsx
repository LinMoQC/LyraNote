"use client"

/**
 * @file Draw.io 架构图嵌入组件
 * @description 将 DiagramData（XML 格式）渲染为嵌入式 Draw.io 画布，
 *              支持查看/编辑模式切换，编辑完成后回写 XML 数据。
 */

import { useRef, useState } from "react"
import { DrawIoEmbed } from "react-drawio"
import type { DrawIoEmbedRef, UrlParameters } from "react-drawio"
import { useTranslations } from "next-intl"
import { LayoutDashboard, Pencil, Check } from "lucide-react"
import type { DiagramData } from "@lyranote/types"
import { cn } from "./utils"

interface DiagramViewProps {
  data: DiagramData
  variant?: "standalone" | "embedded"
  className?: string
}

type DrawIoUrlParameters = UrlParameters & Record<string, string | number | boolean | undefined>

const VIEW_HEIGHT = 420
const EDIT_HEIGHT = 680

export function DiagramView({ data, variant = "standalone", className }: DiagramViewProps) {
  const t = useTranslations("genui")
  const [isLoaded, setIsLoaded] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const drawioRef = useRef<DrawIoEmbedRef>(null)

  const xml = wrapXml(data.xml)
  const urlParameters: DrawIoUrlParameters = {
    ui: "kennedy",
    spin: true,
    ...(isEditing
      ? { noSaveBtn: true, noExitBtn: true }
      : { chrome: false, nav: true, center: true, fit: true }),
  }

  return (
    <div
      className={cn(
        "mt-3 overflow-hidden rounded-xl",
        variant === "embedded"
          ? "bg-background/95"
          : "border border-border/30 bg-background/80",
        className,
      )}
    >
      {/* Header */}
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-3 py-1.5",
          variant === "embedded"
            ? "border-border/15 bg-background/70"
            : "border-border/20 bg-muted/20",
        )}
      >
        <span className="flex items-center gap-1.5 text-sm font-medium text-foreground/70 truncate">
          <LayoutDashboard size={14} className="flex-shrink-0 text-foreground/40" />
          {data.title || t("diagramTitle")}
        </span>
        <button
          type="button"
          onClick={() => {
            setIsLoaded(false)
            setIsEditing((v) => !v)
          }}
          className="flex-shrink-0 flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium transition-colors
            text-foreground/50 hover:text-foreground/70 hover:bg-muted/40"
        >
          {isEditing ? (
            <><Check size={12} />{t("diagramEditDone")}</>
          ) : (
            <><Pencil size={12} />{t("diagramEdit")}</>
          )}
        </button>
      </div>

      {/* Diagram */}
      <div className="relative bg-white" style={{ height: isEditing ? EDIT_HEIGHT : VIEW_HEIGHT }}>
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/20 z-10">
            <span className="text-sm text-muted-foreground animate-pulse">{t("diagramLoading")}</span>
          </div>
        )}
        <DrawIoEmbed
          ref={drawioRef}
          xml={xml}
          urlParameters={urlParameters}
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
