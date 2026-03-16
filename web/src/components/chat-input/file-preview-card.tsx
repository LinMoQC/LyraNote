"use client"

import Image from "next/image"
import { AlertCircle, FileText, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Attachment } from "@/hooks/use-file-attachments"

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"])

function isImage(file: File): boolean {
  return IMAGE_TYPES.has(file.type)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface CircularProgressProps {
  percent: number
  size?: number
  strokeWidth?: number
}

function CircularProgress({ percent, size = 28, strokeWidth = 2.5 }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percent / 100) * circumference

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.2)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="white"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-[stroke-dashoffset] duration-200 ease-out"
      />
    </svg>
  )
}

interface FilePreviewCardProps {
  attachment: Attachment
  onRemove: (localId: string) => void
}

export function FilePreviewCard({ attachment, onRemove }: FilePreviewCardProps) {
  const { localId, file, previewUrl, progress, status } = attachment
  const image = isImage(file)

  if (image) {
    return (
      <div className="group relative h-[72px] w-[72px] flex-shrink-0 overflow-hidden rounded-xl bg-muted/60">
        {previewUrl && (
          <Image
            src={previewUrl}
            alt={file.name}
            fill
            unoptimized
            className={cn(
              "object-cover transition-opacity",
              status === "uploading" && "opacity-60",
            )}
          />
        )}

        {/* Circular progress overlay */}
        {status === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <CircularProgress percent={progress} />
          </div>
        )}

        {/* Error overlay */}
        {status === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <AlertCircle size={18} className="text-red-400" />
          </div>
        )}

        {/* Remove button */}
        <button
          type="button"
          onClick={() => onRemove(localId)}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
        >
          <X size={10} />
        </button>
      </div>
    )
  }

  // Document card
  return (
    <div
      className={cn(
        "group relative flex h-[72px] w-[180px] flex-shrink-0 items-center gap-2.5 overflow-hidden rounded-xl border bg-muted/40 px-3",
        status === "error" ? "border-red-500/40" : "border-border/40",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg",
          status === "error" ? "bg-red-500/10 text-red-400" : "bg-primary/10 text-primary",
        )}
      >
        {status === "error" ? <AlertCircle size={16} /> : <FileText size={16} />}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-foreground/90">{file.name}</p>
        <p className="text-[10px] text-muted-foreground/60">{formatSize(file.size)}</p>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(localId)}
        className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground/40 transition-colors hover:bg-muted hover:text-foreground"
      >
        <X size={10} />
      </button>

      {/* Linear progress bar at bottom */}
      {status === "uploading" && (
        <div className="absolute inset-x-0 bottom-0 h-[3px] bg-muted/60">
          <div
            className="h-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  )
}
