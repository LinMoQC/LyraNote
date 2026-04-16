import { create } from "zustand"

import type { DesktopChatInputSubmitPayload } from "@/components/chat-input/desktop-chat-input"

export const useChatDraftStore = create<ChatDraftStore>((set, get) => ({
  drafts: {},
  saveDraft(draft) {
    const draftId = crypto.randomUUID()
    set((state) => ({
      drafts: {
        ...state.drafts,
        [draftId]: draft,
      },
    }))
    return draftId
  },
  consumeDraft(draftId) {
    const draft = get().drafts[draftId]
    if (!draft) return null
    set((state) => {
      const nextDrafts = { ...state.drafts }
      delete nextDrafts[draftId]
      return { drafts: nextDrafts }
    })
    return draft
  },
}))

interface ChatDraftStore {
  drafts: Record<string, DesktopChatInputSubmitPayload>
  saveDraft: (draft: DesktopChatInputSubmitPayload) => string
  consumeDraft: (draftId: string) => DesktopChatInputSubmitPayload | null
}
