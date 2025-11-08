import type { StateCreator } from "zustand"

import { normaliseConversation } from "@/domain/conversation"
import type { PlatformBridge } from "@/platform/wailsBridge"
import type { ConversationEntry } from "@/types/app"

export type ConversationSlice = {
  conversationByThreadId: Record<number, ConversationEntry[]>
  loadingConversationByThreadId: Record<number, boolean>
  loadedConversationByThreadId: Record<number, boolean>
  conversationErrorsByThreadId: Record<number, string | null>
  loadConversation: (threadId: number | null) => Promise<ConversationEntry[]>
  ensureConversation: (threadId: number) => void
  updateConversationEntries: (threadId: number, updater: (entries: ConversationEntry[]) => ConversationEntry[]) => void
}

export const createConversationSlice = (
  bridge: PlatformBridge
): StateCreator<ConversationSlice, [], []> => {
  return (set) => ({
    conversationByThreadId: {},
    loadingConversationByThreadId: {},
    loadedConversationByThreadId: {},
    conversationErrorsByThreadId: {},
    loadConversation: async (threadId) => {
      if (!threadId) {
        return []
      }
      set((state) => ({
        ...state,
        loadingConversationByThreadId: { ...state.loadingConversationByThreadId, [threadId]: true },
        conversationErrorsByThreadId: { ...state.conversationErrorsByThreadId, [threadId]: null }
      }))
      try {
        const response = await bridge.threads.loadConversation(threadId)
        const normalized = normaliseConversation(response)
        set((state) => ({
          ...state,
          conversationByThreadId: { ...state.conversationByThreadId, [threadId]: normalized }
        }))
        return normalized
      } catch (error) {
        set((state) => ({
          ...state,
          conversationErrorsByThreadId: {
            ...state.conversationErrorsByThreadId,
            [threadId]: normalizeError(error)
          }
        }))
        throw error
      } finally {
        set((state) => ({
          ...state,
          loadingConversationByThreadId: { ...state.loadingConversationByThreadId, [threadId]: false },
          loadedConversationByThreadId: { ...state.loadedConversationByThreadId, [threadId]: true }
        }))
      }
    },
    ensureConversation: (threadId) => {
      if (threadId <= 0) {
        return
      }
      set((state) => {
        if (state.conversationByThreadId[threadId]) {
          return state
        }
        return {
          ...state,
          conversationByThreadId: { ...state.conversationByThreadId, [threadId]: [] }
        }
      })
    },
    updateConversationEntries: (threadId, updater) => {
      if (threadId <= 0) {
        return
      }
      set((state) => {
        const existing = state.conversationByThreadId[threadId] ?? []
        const nextEntries = updater(existing)
        return {
          ...state,
          conversationByThreadId: { ...state.conversationByThreadId, [threadId]: nextEntries }
        }
      })
    }
  })
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "Unable to load conversation"
}
