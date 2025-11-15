import { useCallback, useMemo, useRef } from "react"

import { formatThreadSections, updateThreadPreview } from "@/domain/threads"
import { useAppStore, useAppStoreApi } from "@/state/createAppStore"
import type {
  AgentConversationEntry,
  AgentItemPayload,
  ConversationEntry,
  SystemConversationEntry,
  ThreadSection,
  UserConversationEntry
} from "@/types/app"
import type { AgentThread } from "@/types/app"

export type ConversationManager = {
  sections: ThreadSection[]
  loadConversation: (threadId: number) => Promise<ConversationEntry[]>
  appendUserEntry: (threadId: number, entry: UserConversationEntry) => void
  upsertAgentEntry: (threadId: number, item: AgentItemPayload) => void
  appendSystemEntry: (threadId: number, entry: SystemConversationEntry) => void
  ensureTimeline: (threadId: number) => void
  resetAgentEntries: (threadId: number) => void
  syncThreadPreviewFromConversation: (threadId: number) => void
  getConversationEntries: (threadId: number) => ConversationEntry[]
  setThreads: (updater: (threads: AgentThread[]) => AgentThread[]) => void
}

export function useConversationManager(options: {
  threads: AgentThread[]
  setThreads: (updater: (threads: AgentThread[]) => AgentThread[]) => void
}) {
  const { threads, setThreads } = options
  const storeApi = useAppStoreApi()
  const ensureConversation = useAppStore((state) => state.ensureConversation)
  const updateConversationEntries = useAppStore((state) => state.updateConversationEntries)
  const loadConversationState = useAppStore((state) => state.loadConversation)
  const liveAgentEntryIdsRef = useRef(new Map<number, Map<string, string>>())

  const getLiveIdentifierMap = useCallback((threadId: number) => {
    let map = liveAgentEntryIdsRef.current.get(threadId)
    if (!map) {
      map = new Map()
      liveAgentEntryIdsRef.current.set(threadId, map)
    }
    return map
  }, [])

  const resetAgentEntries = useCallback((threadId: number) => {
    if (threadId <= 0) {
      return
    }
    liveAgentEntryIdsRef.current.set(threadId, new Map())
  }, [])

  const ensureLiveIdentifier = useCallback(
    (threadId: number, candidate: string, entries: ConversationEntry[]) => {
      const base = candidate && candidate.trim() ? candidate.trim() : `agent-${Date.now().toString(36)}`
      if (threadId <= 0) {
        return base
      }
      const map = getLiveIdentifierMap(threadId)
      const assigned = map.get(base)
      if (assigned) {
        return assigned
      }
      const collision = entries.some((entry) => entry.role === "agent" && entry.id === base)
      const uniqueId = collision ? `${base}-${Date.now().toString(36)}` : base
      map.set(base, uniqueId)
      return uniqueId
    },
    [getLiveIdentifierMap]
  )

  const applyThreadPreview = useCallback(
    (threadId: number, text: string, timestamp: string) => {
      if (!text.trim()) {
        return
      }
      setThreads((prev) =>
        prev.map((thread) => (thread.id === threadId ? updateThreadPreview(thread, text, timestamp) : thread))
      )
    },
    [setThreads]
  )

  const ensureTimeline = useCallback(
    (threadId: number) => {
      if (threadId <= 0) {
        return
      }
      ensureConversation(threadId)
    },
    [ensureConversation]
  )

  const getConversationEntries = useCallback(
    (threadId: number): ConversationEntry[] => {
      if (threadId <= 0) {
        return []
      }
      return storeApi.getState().conversationByThreadId[threadId] ?? []
    },
    [storeApi]
  )

  const updateEntries = useCallback(
    (threadId: number, updater: (entries: ConversationEntry[]) => ConversationEntry[]) => {
      if (threadId <= 0) {
        return
      }
      updateConversationEntries(threadId, updater)
    },
    [updateConversationEntries]
  )

  const applyPreviewFromEntries = useCallback(
    (threadId: number, entries: ConversationEntry[]) => {
      if (!entries.length) {
        return
      }
      let previewText = ""
      let timestamp = entries[entries.length - 1].createdAt
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index]
        if (entry.role === "agent" && entry.item) {
          if (entry.item.type === "agent_message" && entry.item.text) {
            previewText = entry.item.text
            timestamp = entry.updatedAt ?? entry.createdAt
            break
          }
          if (entry.item.reasoning) {
            previewText = entry.item.reasoning
            timestamp = entry.updatedAt ?? entry.createdAt
            break
          }
        } else if (entry.role === "user") {
          previewText = entry.text ?? ""
          timestamp = entry.createdAt
          break
        }
      }
      if (previewText.trim()) {
        applyThreadPreview(threadId, previewText, timestamp)
      }
    },
    [applyThreadPreview]
  )

  const loadConversation = useCallback(
    async (threadId: number) => {
      if (threadId <= 0) {
        return [] as ConversationEntry[]
      }
      const entries = await loadConversationState(threadId)
      applyPreviewFromEntries(threadId, entries)
      return entries
    },
    [applyPreviewFromEntries, loadConversationState]
  )

  const appendUserEntry = useCallback(
    (threadId: number, entry: UserConversationEntry) => {
      ensureTimeline(threadId)
      updateEntries(threadId, (existing) => [...existing, entry])
      if (entry.text.trim()) {
        applyThreadPreview(threadId, entry.text, entry.createdAt)
      }
    },
    [applyThreadPreview, ensureTimeline, updateEntries]
  )

  const upsertAgentEntry = useCallback(
    (threadId: number, item: AgentItemPayload) => {
      const baseIdentifier = item.id && item.id.trim() ? item.id : `agent-${Date.now().toString(36)}`
      const timestamp = new Date().toISOString()
      ensureTimeline(threadId)
      updateEntries(threadId, (existing) => {
        const identifier = ensureLiveIdentifier(threadId, baseIdentifier, existing)
        let index = -1
        for (let idx = existing.length - 1; idx >= 0; idx -= 1) {
          const entry = existing[idx]
          if (entry.role === "agent" && entry.id === identifier) {
            index = idx
            break
          }
        }
        if (index >= 0) {
          const current = existing[index] as AgentConversationEntry
          const nextEntry: AgentConversationEntry = {
            ...current,
            item: { ...item, id: identifier },
            updatedAt: timestamp
          }
          const nextList = [...existing]
          nextList[index] = nextEntry
          return nextList
        }
        const nextEntry: AgentConversationEntry = {
          id: identifier,
          role: "agent",
          createdAt: timestamp,
          updatedAt: timestamp,
          item: { ...item, id: identifier }
        }
        return [...existing, nextEntry]
      })

      if (item.type === "agent_message" && item.text) {
        applyThreadPreview(threadId, item.text, timestamp)
      }
    },
    [applyThreadPreview, ensureLiveIdentifier, ensureTimeline, updateEntries]
  )

  const appendSystemEntry = useCallback(
    (threadId: number, entry: SystemConversationEntry) => {
      ensureTimeline(threadId)
      updateEntries(threadId, (existing) => [...existing, entry])
    },
    [ensureTimeline, updateEntries]
  )

  const syncThreadPreviewFromConversation = useCallback(
    (threadId: number) => {
      const entries = getConversationEntries(threadId)
      if (!entries || entries.length === 0) {
        return
      }
      applyPreviewFromEntries(threadId, entries)
    },
    [applyPreviewFromEntries, getConversationEntries]
  )

  const sections = useMemo<ThreadSection[]>(() => formatThreadSections(threads), [threads])

  return {
    sections,
    loadConversation,
    appendUserEntry,
    upsertAgentEntry,
    appendSystemEntry,
    ensureTimeline,
    resetAgentEntries,
    syncThreadPreviewFromConversation,
    getConversationEntries,
    setThreads
  }
}
