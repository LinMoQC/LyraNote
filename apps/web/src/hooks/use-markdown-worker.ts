"use client"

/**
 * @file Markdown 转 HTML Web Worker Hook
 * @description 利用 Web Worker 异步执行 Markdown → HTML 转换，避免阻塞主线程。
 *              短文本（≤2000 字符）同步转换以避免 Worker 通信开销。
 *              Worker 超时或失败时自动回退到同步转换。
 */

import { useCallback, useEffect, useRef } from "react"
import { markdownToHtml } from "@/utils/markdown-to-html"

type PendingMap = Map<string, (html: string) => void>

/** 短文本同步转换阈值（字符数），低于此值直接在主线程转换 */
const SYNC_THRESHOLD = 2000

/** Worker 超时时间（ms），超时后回退到同步转换 */
const WORKER_TIMEOUT_MS = 1500

/**
 * Markdown 转 HTML 异步转换 Hook
 * @description 返回一个稳定的异步函数，短文本同步转换，长文本通过 Worker 异步转换。
 * @returns (md: string) => Promise<string> 转换函数
 */
export function useMarkdownWorker(): (md: string) => Promise<string> {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<PendingMap>(new Map())
  const workerReadyRef = useRef(false)

  useEffect(() => {
    let worker: Worker | null = null
    try {
      worker = new Worker(
        new URL("../workers/markdown.worker.ts", import.meta.url)
      )

      worker.onmessage = (e: MessageEvent<{ id: string; html: string }>) => {
        const resolve = pendingRef.current.get(e.data.id)
        if (resolve) {
          pendingRef.current.delete(e.data.id)
          resolve(e.data.html ?? "")
        }
      }

      worker.onerror = () => {
        workerReadyRef.current = false
        // Drain any pending requests to their sync fallback
        pendingRef.current.forEach((resolve, id) => {
          pendingRef.current.delete(id)
          resolve("__FALLBACK__")
        })
      }

      workerRef.current = worker
      workerReadyRef.current = true
    } catch {
      workerReadyRef.current = false
    }

    const pendingMap = pendingRef.current
    return () => {
      worker?.terminate()
      workerRef.current = null
      workerReadyRef.current = false
      pendingMap.forEach((resolve) => resolve("__FALLBACK__"))
      pendingMap.clear()
    }
  }, [])

  return useCallback((md: string): Promise<string> => {
    // Always use sync for short content — conversion is instant
    if (md.length <= SYNC_THRESHOLD || !workerReadyRef.current) {
      return Promise.resolve(markdownToHtml(md))
    }

    return new Promise((resolve) => {
      const id = crypto.randomUUID()
      let settled = false

      const settle = (html: string) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        // "__FALLBACK__" sentinel means Worker failed — use sync
        resolve(html === "__FALLBACK__" ? markdownToHtml(md) : html)
      }

      // Timeout: if Worker doesn't respond in time, fall back to sync
      const timer = setTimeout(() => {
        pendingRef.current.delete(id)
        settle(markdownToHtml(md))
      }, WORKER_TIMEOUT_MS)

      pendingRef.current.set(id, settle)
      workerRef.current?.postMessage({ id, md })
    })
  }, [])
}
