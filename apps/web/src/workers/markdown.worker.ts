/**
 * Web Worker: converts Markdown to HTML off the main thread.
 * Receives: { id: string; md: string }
 * Responds: { id: string; html: string }
 *
 * NOTE: Cannot use @/ path aliases here because workers are bundled separately.
 * Import the utility with a relative path instead.
 */
import { markdownToHtml } from "../utils/markdown-to-html"

type WorkerScope = { addEventListener: typeof addEventListener; postMessage: typeof postMessage }
const ctx = globalThis as unknown as WorkerScope

ctx.addEventListener("message", (e: MessageEvent<{ id: string; md: string }>) => {
  const { id, md } = e.data
  try {
    const html = markdownToHtml(md)
    ctx.postMessage({ id, html })
  } catch (err) {
    ctx.postMessage({ id, html: "", error: String(err) })
  }
})
