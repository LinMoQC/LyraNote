"use client"

/**
 * @file 文件附件管理 Hook
 * @description 管理消息输入框中的文件附件：选择文件后自动上传，
 *              追踪上传进度，支持取消上传和移除附件。
 *              图片类型文件自动生成本地预览 URL。
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { uploadWithProgress, type UploadResult } from "@/lib/upload"

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"])

function isImageFile(file: File): boolean {
  return IMAGE_TYPES.has(file.type)
}

/** 附件对象（公开字段） */
export interface Attachment {
  localId: string
  file: File
  previewUrl: string | null
  progress: number
  status: "uploading" | "done" | "error"
  serverId: string | null
  storageKey: string | null
  errorMessage?: string
}

interface AttachmentInternal extends Attachment {
  abortController: AbortController
}

export interface UseFileAttachments {
  attachments: Attachment[]
  addFiles: (files: FileList | File[]) => void
  removeAttachment: (localId: string) => void
  clearAll: (keepPreviewUrls?: boolean) => void
  getServerIds: () => string[]
  isUploading: boolean
}

/**
 * 文件附件管理 Hook
 * @description 选择文件后自动开始上传，追踪每个文件的上传进度和状态。
 *              组件卸载时自动释放预览 URL 和取消上传。
 * @returns {{ attachments, addFiles, removeAttachment, clearAll, getServerIds, isUploading }}
 */
export function useFileAttachments(): UseFileAttachments {
  const [attachments, setAttachments] = useState<AttachmentInternal[]>([])
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
      }
    }
  }, [])

  const startUpload = useCallback((attachment: AttachmentInternal) => {
    uploadWithProgress(
      attachment.file,
      (percent) => {
        setAttachments((prev) =>
          prev.map((a) => a.localId === attachment.localId ? { ...a, progress: percent } : a),
        )
      },
      attachment.abortController.signal,
    )
      .then((result: UploadResult) => {
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === attachment.localId
              ? { ...a, status: "done" as const, progress: 100, serverId: result.id, storageKey: result.storage_key }
              : a,
          ),
        )
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return
        setAttachments((prev) =>
          prev.map((a) =>
            a.localId === attachment.localId
              ? { ...a, status: "error" as const, errorMessage: err instanceof Error ? err.message : "Upload failed" }
              : a,
          ),
        )
      })
  }, [])

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    const newAttachments: AttachmentInternal[] = fileArray.map((file) => {
      const localId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const previewUrl = isImageFile(file) ? URL.createObjectURL(file) : null
      const abortController = new AbortController()

      return {
        localId,
        file,
        previewUrl,
        progress: 0,
        status: "uploading" as const,
        serverId: null,
        storageKey: null,
        abortController,
      }
    })

    setAttachments((prev) => [...prev, ...newAttachments])

    for (const att of newAttachments) {
      startUpload(att)
    }
  }, [startUpload])

  const removeAttachment = useCallback((localId: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.localId === localId)
      if (target) {
        if (target.status === "uploading") target.abortController.abort()
        if (target.previewUrl) URL.revokeObjectURL(target.previewUrl)
      }
      return prev.filter((a) => a.localId !== localId)
    })
  }, [])

  const clearAll = useCallback((keepPreviewUrls = false) => {
    setAttachments((prev) => {
      for (const a of prev) {
        if (a.status === "uploading") a.abortController.abort()
        if (a.previewUrl && !keepPreviewUrls) URL.revokeObjectURL(a.previewUrl)
      }
      return []
    })
  }, [])

  const getServerIds = useCallback(() => {
    return attachmentsRef.current
      .filter((a) => a.status === "done" && a.serverId)
      .map((a) => a.serverId!)
  }, [])

  const isUploading = attachments.some((a) => a.status === "uploading")

  // Expose without internal abortController
  const publicAttachments: Attachment[] = attachments.map(({ abortController: _, ...rest }) => rest)

  return {
    attachments: publicAttachments,
    addFiles,
    removeAttachment,
    clearAll,
    getServerIds,
    isUploading,
  }
}
