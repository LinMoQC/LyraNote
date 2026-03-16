"use client"

import type { Attachment } from "@/hooks/use-file-attachments"
import { FilePreviewCard } from "./file-preview-card"

interface AttachmentPreviewBarProps {
  attachments: Attachment[]
  onRemove: (localId: string) => void
}

export function AttachmentPreviewBar({ attachments, onRemove }: AttachmentPreviewBarProps) {
  if (attachments.length === 0) return null

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto">
      {attachments.map((att) => (
        <FilePreviewCard key={att.localId} attachment={att} onRemove={onRemove} />
      ))}
    </div>
  )
}
