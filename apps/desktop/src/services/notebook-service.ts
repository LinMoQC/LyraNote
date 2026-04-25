import { getDesktopNotebookService } from "@/lib/api-client"
import type { NotebookUpdatePayload } from "@lyranote/api-client"

export function getNotebooks() {
  return getDesktopNotebookService().getNotebooks()
}

export function createNotebook(title: string, description?: string) {
  return getDesktopNotebookService().createNotebook(title, description)
}

export function updateNotebook(id: string, payload: NotebookUpdatePayload) {
  return getDesktopNotebookService().updateNotebook(id, payload)
}

export function deleteNotebook(id: string) {
  return getDesktopNotebookService().deleteNotebook(id)
}

export function publishNotebook(id: string) {
  return getDesktopNotebookService().publishNotebook(id)
}

export function unpublishNotebook(id: string) {
  return getDesktopNotebookService().unpublishNotebook(id)
}
