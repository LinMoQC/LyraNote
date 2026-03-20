/**
 * @file 行内润色 Hook
 * @description 选中编辑器文本后调用 AI 润色 API（SSE 流式），
 *              完成后以打字机动画效果替换原文。支持取消操作。
 */

import { useCallback, useRef, useState } from "react"
import type { Editor } from "@tiptap/react"
import { AI } from "@/lib/api-routes"
import { http } from "@/lib/http-client"

/** 每帧插入的字符数（约 60fps，即 ~180 字符/秒） */
const CHARS_PER_FRAME = 3

/**
 * 行内润色 Hook
 * @param editor - Tiptap 编辑器实例
 * @returns {{ polish, cancel, isPolishing }} 润色触发、取消和状态
 */
export function useInlinePolish(editor: Editor | null) {
  const [isPolishing, setIsPolishing] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  const polish = useCallback(async () => {
    if (!editor || isPolishing) return

    const { from, to } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, "\n")
    if (!selectedText.trim()) return

    abortRef.current?.abort()
    abortRef.current = new AbortController()
    cancelledRef.current = false
    setIsPolishing(true)

    try {
      const res = await http.stream(
        AI.POLISH,
        { text: selectedText },
        { signal: abortRef.current.signal },
      )

      // ── 1. Parse SSE stream, keep original text visible while buffering ──
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let result = ""
      let buffer = ""

      outer: while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE frames are separated by double newline
        const frames = buffer.split("\n\n")
        buffer = frames.pop() ?? "" // keep incomplete last frame

        for (const frame of frames) {
          const line = frame.trim()
          if (!line.startsWith("data:")) continue
          const payload = line.slice(5).trim()
          if (payload === "[DONE]") break outer
          try {
            const parsed = JSON.parse(payload) as { token?: string }
            if (parsed.token) result += parsed.token
          } catch {
            // ignore malformed frames
          }
        }
      }

      if (!result.trim() || cancelledRef.current) return

      // ── 2. Delete original selection in one transaction ────────────────────
      const delTr = editor.state.tr.delete(from, to)
      editor.view.dispatch(delTr)

      // ── 3. Typewriter animation — insert CHARS_PER_FRAME chars per frame ──
      let cursor = from
      const total = result.length

      const typeChunk = () => {
        if (cancelledRef.current) {
          setIsPolishing(false)
          return
        }
        if (cursor >= from + total) {
          editor.commands.focus()
          editor.commands.setTextSelection(cursor)
          setIsPolishing(false)
          return
        }
        const end = Math.min(cursor + CHARS_PER_FRAME, from + total)
        const chunk = result.slice(cursor - from, end - from)
        const insertTr = editor.state.tr.insertText(chunk, cursor)
        editor.view.dispatch(insertTr)
        cursor = end
        requestAnimationFrame(typeChunk)
      }

      requestAnimationFrame(typeChunk)
      return // setIsPolishing handled inside typeChunk
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("[useInlinePolish]", err)
      }
    }
    setIsPolishing(false)
  }, [editor, isPolishing])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    abortRef.current?.abort()
    setIsPolishing(false)
  }, [])

  return { polish, cancel, isPolishing }
}
