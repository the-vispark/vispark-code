import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ChatInputState {
  drafts: Record<string, string>
  setDraft: (chatId: string, value: string) => void
  clearDraft: (chatId: string) => void
  getDraft: (chatId: string) => string
}

export const useChatInputStore = create<ChatInputState>()(
  persist(
    (set, get) => ({
      drafts: {},

      setDraft: (chatId, value) =>
        set((state) => {
          if (!value) {
            const { [chatId]: _, ...rest } = state.drafts
            return { drafts: rest }
          }
          return { drafts: { ...state.drafts, [chatId]: value } }
        }),

      clearDraft: (chatId) =>
        set((state) => {
          const { [chatId]: _, ...rest } = state.drafts
          return { drafts: rest }
        }),

      getDraft: (chatId) => get().drafts[chatId] ?? "",
    }),
    {
      name: "chat-input-drafts",
    }
  )
)
