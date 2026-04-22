import { getDesktopNotebookService, getDesktopNoteService } from "@/lib/api-client"

function deriveCaptureTitle(content: string) {
  const firstLine = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)

  if (!firstLine) {
    return `Quick Capture ${new Date().toLocaleString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
      month: "2-digit",
      day: "2-digit",
    })}`
  }

  return firstLine.slice(0, 48)
}

function buildQuickCaptureDoc(content: string) {
  const paragraphs = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      type: "paragraph",
      content: [{ type: "text", text: line }],
    }))

  return {
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph" }],
  }
}

export async function createQuickCaptureNote(content: string) {
  const notebook = await getDesktopNotebookService().getGlobalNotebook()
  const title = deriveCaptureTitle(content)
  const note = await getDesktopNoteService().createNote(notebook.id, title)
  const updated = await getDesktopNoteService().updateNote(note.id, {
    title,
    content_text: content,
    content_json: buildQuickCaptureDoc(content),
  })

  return {
    notebook,
    note: updated,
    title,
  }
}
