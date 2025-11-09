import { useCallback, useEffect } from "react"

import { useAppStore } from "@/state/createAppStore"
import type { ConversationEntry } from "@/types/app"

export function useThreadConversation(threadId: number | null) {
  const entries = useAppStore((state) => (threadId ? state.conversationByThreadId[threadId] ?? [] : []))
  const isLoading = useAppStore((state) => (threadId ? state.loadingConversationByThreadId[threadId] ?? false : false))
  const hasLoaded = useAppStore((state) => (threadId ? state.loadedConversationByThreadId[threadId] ?? false : false))
  const error = useAppStore((state) => (threadId ? state.conversationErrorsByThreadId[threadId] ?? null : null))
  const loadConversation = useAppStore((state) => state.loadConversation)
  const updateConversationEntries = useAppStore((state) => state.updateConversationEntries)
  const ensureConversation = useAppStore((state) => state.ensureConversation)

  useEffect(() => {
    if (threadId && !hasLoaded) {
      void loadConversation(threadId).catch(() => undefined)
    }
  }, [threadId, hasLoaded, loadConversation])

  const setConversation = useCallback(
    (updater: (current: ConversationEntry[]) => ConversationEntry[]) => {
      if (!threadId) {
        return
      }
      ensureConversation(threadId)
      updateConversationEntries(threadId, updater)
    },
    [ensureConversation, threadId, updateConversationEntries]
  )

  return {
    entries,
    isLoading,
    error,
    refetch: () => (threadId ? loadConversation(threadId) : Promise.resolve([])),
    setConversation
  }
}
