import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { agents } from "../../wailsjs/go/models"
import { DeleteAttachment, DeleteThread, LoadThreadConversation, RenameThread } from "../../wailsjs/go/main/App"
import { formatThreadSections, mapThreadDtoToThread, threadToListItem, updateThreadPreview } from "@/lib/threads"
import type {
  AgentConversationEntry,
  AgentItemPayload,
  AgentUsage,
  ConversationEntry,
  SystemConversationEntry,
  ThreadListItem,
  ThreadSection,
  UserConversationEntry,
  UserMessageSegment
} from "@/types/app"
import { useProjects } from "@/hooks/useProjects"
import { useAgentThreads } from "@/hooks/useAgentThreads"
import { useAgentStream } from "@/hooks/useAgentStream"

type SendMessageOptions = {
  content: string
  model: string
  sandbox: string
  reasoning: string
  attachmentPaths?: string[]
  segments?: UserMessageSegment[]
}

type ConversationMap = Record<number, ConversationEntry[]>

export function useWorkspaceController() {
  const {
    projects,
    activeProject,
    isLoading: projectsLoading,
    error: projectsError,
    selectProject,
    registerProject,
    deleteProject
  } = useProjects()

  const [streamError, setStreamError] = useState<string | null>(null)
  const pendingAttachmentsRef = useRef<Map<string, string[]>>(new Map())

  const [conversationMap, setConversationMap] = useState<ConversationMap>({})
  const conversationRef = useRef<ConversationMap>({})

  const updateConversationMap = useCallback((updater: (current: ConversationMap) => ConversationMap) => {
    setConversationMap((prev) => {
      const next = updater(prev)
      conversationRef.current = next
      return next
    })
  }, [])

  const ensureTimeline = useCallback(
    (threadId: number) => {
      if (threadId <= 0) {
        return
      }
      updateConversationMap((prev) => {
        if (prev[threadId]) {
          return prev
        }
        return { ...prev, [threadId]: [] }
      })
    },
    [updateConversationMap]
  )

  const projectId = activeProject?.id ?? null
  const {
    threads,
    isLoading: threadsLoading,
    error: threadsError,
    refreshThread,
    setThreads
  } = useAgentThreads(projectId)

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
      try {
        const response = await LoadThreadConversation(threadId)
        const normalized: ConversationEntry[] = response.map((entry) => {
          if (entry.role === "agent") {
            const cloned = entry.item
              ? (JSON.parse(JSON.stringify(entry.item)) as AgentItemPayload)
              : ({ id: entry.id, type: "agent_message", text: "" } as AgentItemPayload)
            return {
              id: entry.id,
              role: "agent" as const,
              createdAt: entry.createdAt,
              updatedAt: entry.updatedAt ?? entry.createdAt,
              item: cloned
            }
          }
          if (entry.role === "user") {
            const segments: UserMessageSegment[] = (entry.segments ?? []).map((segment) => {
              if (segment.type === "image") {
                return { type: "image", imagePath: segment.imagePath ?? "" }
              }
              return { type: "text", text: segment.text ?? "" }
            })
            return {
              id: entry.id,
              role: "user" as const,
              createdAt: entry.createdAt,
              text: entry.text ?? "",
              segments
            }
          }
          return {
            id: entry.id,
            role: "system" as const,
            createdAt: entry.createdAt,
            tone: (entry.tone as SystemConversationEntry["tone"]) ?? "info",
            message: entry.message ?? "",
            meta: entry.meta ?? {}
          }
        })
        updateConversationMap((prev) => ({ ...prev, [threadId]: normalized }))
        applyPreviewFromEntries(threadId, normalized)
        return normalized
      } catch (error) {
        console.error("Failed to load conversation", error)
        return [] as ConversationEntry[]
      }
    },
    [applyPreviewFromEntries, updateConversationMap]
  )

  const appendUserEntry = useCallback(
    (threadId: number, entry: UserConversationEntry) => {
      updateConversationMap((prev) => {
        const existing = prev[threadId] ?? []
        return { ...prev, [threadId]: [...existing, entry] }
      })
      if (entry.text.trim()) {
        applyThreadPreview(threadId, entry.text, entry.createdAt)
      }
    },
    [applyThreadPreview, updateConversationMap]
  )

  const upsertAgentEntry = useCallback(
    (threadId: number, item: AgentItemPayload) => {
      const identifier = item.id && item.id.trim() ? item.id : `agent-${Date.now().toString(36)}`
      const timestamp = new Date().toISOString()
      updateConversationMap((prev) => {
        const existing = prev[threadId] ?? []
        const index = existing.findIndex((entry) => entry.role === "agent" && entry.id === identifier)
        if (index >= 0) {
          const current = existing[index] as AgentConversationEntry
          const nextEntry: AgentConversationEntry = {
            ...current,
            item: { ...item, id: identifier },
            updatedAt: timestamp
          }
          const nextList = [...existing]
          nextList[index] = nextEntry
          return { ...prev, [threadId]: nextList }
        }
        const nextEntry: AgentConversationEntry = {
          id: identifier,
          role: "agent",
          createdAt: timestamp,
          updatedAt: timestamp,
          item: { ...item, id: identifier }
        }
        return { ...prev, [threadId]: [...existing, nextEntry] }
      })

      if (item.type === "agent_message" && item.text) {
        applyThreadPreview(threadId, item.text, timestamp)
      }
    },
    [applyThreadPreview, updateConversationMap]
  )

  const appendSystemEntry = useCallback(
    (threadId: number, entry: SystemConversationEntry) => {
      updateConversationMap((prev) => {
        const existing = prev[threadId] ?? []
        return { ...prev, [threadId]: [...existing, entry] }
      })
    },
    [updateConversationMap]
  )

  const syncThreadPreviewFromConversation = useCallback(
    (threadId: number) => {
      const entries = conversationRef.current[threadId]
      if (!entries || entries.length === 0) {
        return
      }
      applyPreviewFromEntries(threadId, entries)
    },
    [applyPreviewFromEntries]
  )

  const sections = useMemo<ThreadSection[]>(() => formatThreadSections(threads), [threads])

  const [activeThread, setActiveThread] = useState<ThreadListItem | null>(null)

  useEffect(() => {
    if (!threads.length) {
      setActiveThread(null)
      return
    }
    setActiveThread((prev) => {
      if (prev) {
        const existing = threads.find((thread) => thread.id === prev.id)
        if (existing) {
          return threadToListItem(existing)
        }
      }
      return threadToListItem(threads[0])
    })
  }, [threads])

  const threadId = activeThread?.id ?? null
  const conversation = useMemo(() => {
    if (!threadId) {
      return []
    }
    return conversationMap[threadId] ?? []
  }, [conversationMap, threadId])

  const { startStream, cancelStream, isStreaming, status, usage, threadId: streamThreadId } = useAgentStream({
    onEvent: (event, context) => {
      const targetThreadId = context.threadId ?? threadId ?? undefined
      if (!targetThreadId) {
        return
      }
      ensureTimeline(targetThreadId)

      if (event.type === "turn.started") {
        const entry: SystemConversationEntry = {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: "info",
          message: "Assistant started thinking"
        }
        appendSystemEntry(targetThreadId, entry)
      }

      if (event.item) {
        upsertAgentEntry(targetThreadId, event.item)
      }

      if (event.type === "turn.completed") {
        const entry: SystemConversationEntry = {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: "info",
          message: formatUsageSummary(event.usage)
        }
        appendSystemEntry(targetThreadId, entry)
      }

      if (event.error?.message) {
        const entry: SystemConversationEntry = {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: "error",
          message: event.error.message
        }
        appendSystemEntry(targetThreadId, entry)
      }
    },
    onComplete: async (threadIdFromStream, statusMessage, streamId) => {
      if (streamId) {
        const attachments = pendingAttachmentsRef.current.get(streamId) ?? []
        if (attachments.length > 0) {
          pendingAttachmentsRef.current.delete(streamId)
          await Promise.all(
            attachments.map(async (path) => {
              try {
                await DeleteAttachment(path)
              } catch (error) {
                console.error("Failed to delete stream attachment", error)
              }
            })
          )
        }
      }

      setStreamError(null)
      const record = await refreshThread(threadIdFromStream)
      const listItem = threadToListItem(record)
      setActiveThread(listItem)

      await loadConversation(threadIdFromStream)

      if (statusMessage && statusMessage.trim()) {
        const entry: SystemConversationEntry = {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: statusMessage === "error" ? "error" : "info",
          message: statusMessage
        }
        appendSystemEntry(threadIdFromStream, entry)
      }
    },
    onError: (message) => {
      setStreamError(message)
    }
  })

  useEffect(() => {
    if (!threadId) {
      return
    }
    ensureTimeline(threadId)
    if (isStreaming && streamThreadId === threadId) {
      return
    }
    void loadConversation(threadId)
  }, [ensureTimeline, isStreaming, loadConversation, streamThreadId, threadId])

  const handleThreadSelect = useCallback(
    (thread: ThreadListItem) => {
      setActiveThread(thread)
    },
    []
  )

  const handleNewThread = useCallback(() => {
    setActiveThread(null)
    setStreamError(null)
  }, [])

  const sendMessage = useCallback(
    async ({ content, model, sandbox, reasoning, segments, attachmentPaths }: SendMessageOptions) => {
      const project = activeProject
      if (!project) {
        throw new Error("No active project selected")
      }

      const trimmed = content.trim()
      const normalizedSegments =
        segments
          ?.map((segment) => {
            if (segment.type === "text") {
              const text = segment.text?.trim()
              if (!text) {
                return null
              }
              return { type: "text" as const, text }
            }
            if (segment.type === "image") {
              const imagePath = segment.imagePath?.trim()
              if (!imagePath) {
                return null
              }
              return { type: "image" as const, imagePath }
            }
            return null
          })
          .filter((segment): segment is UserMessageSegment => segment !== null) ?? []

      const hasSegments = normalizedSegments.length > 0
      if (!trimmed && !hasSegments) {
        return
      }

      setStreamError(null)

      const existingThread = activeThread
        ? threads.find((thread) => thread.id === activeThread.id)
        : undefined

      const request = agents.MessageRequest.createFrom({
        agentId: "codex",
        projectId: project.id,
        threadId: activeThread?.id ?? 0,
        threadExternalId: existingThread?.externalId,
        input: hasSegments ? "" : trimmed,
        segments: hasSegments ? normalizedSegments : undefined,
        threadOptions: {
          model,
          sandboxMode: sandbox,
          reasoningLevel: reasoning
        }
      })

      const userEntry: UserConversationEntry = {
        id: `user-${Date.now().toString(36)}`,
        role: "user",
        createdAt: new Date().toISOString(),
        text: trimmed,
        segments: hasSegments ? normalizedSegments : undefined
      }

      const handle = await startStream(request)
      ensureTimeline(handle.threadId)
      appendUserEntry(handle.threadId, userEntry)

      const streamAttachments = attachmentPaths?.filter((path) => path.trim() !== "") ?? []
      if (streamAttachments.length > 0 && handle.streamId) {
        pendingAttachmentsRef.current.set(handle.streamId, streamAttachments)
      }

      const record = await refreshThread(handle.threadId)
      const listItem = threadToListItem(record)
      setActiveThread(listItem)
      syncThreadPreviewFromConversation(handle.threadId)
    },
    [
      activeProject,
      activeThread,
      appendUserEntry,
      ensureTimeline,
      refreshThread,
      startStream,
      syncThreadPreviewFromConversation,
      threads
    ]
  )

  useEffect(() => {
    return () => {
      const pending = Array.from(pendingAttachmentsRef.current.values()).flat()
      pendingAttachmentsRef.current.clear()
      pending.forEach((path) => {
        void DeleteAttachment(path).catch((error) => {
          console.error("Failed to delete pending attachment on cleanup", error)
        })
      })
    }
  }, [])

  const selectedThread = useMemo(() => {
    if (!activeThread) {
      return null
    }
    return threads.find((thread) => thread.id === activeThread.id) ?? null
  }, [activeThread, threads])

  const renameThread = useCallback(
    async (thread: ThreadListItem, title: string) => {
      try {
        const updated = await RenameThread(thread.id, title)
        const mapped = mapThreadDtoToThread(updated)
        let updatedThread: ReturnType<typeof mapThreadDtoToThread> | null = null
        setThreads((prev) =>
          prev.map((existing) => {
            if (existing.id !== mapped.id) {
              return existing
            }
            const next = {
              ...mapped,
              preview: existing.preview,
              lastTimestamp: existing.lastTimestamp
            }
            updatedThread = next
            return next
          })
        )
        setActiveThread((prev) => {
          if (!updatedThread || !prev || prev.id !== updatedThread.id) {
            return prev
          }
          return threadToListItem(updatedThread)
        })
      } catch (error) {
        throw error
      }
    },
    [setActiveThread, setThreads]
  )

  const deleteThread = useCallback(
    async (thread: ThreadListItem) => {
      try {
        await DeleteThread(thread.id)
        setThreads((prev) => prev.filter((existing) => existing.id !== thread.id))
        updateConversationMap((prev) => {
          if (!prev[thread.id]) {
            return prev
          }
          const next = { ...prev }
          delete next[thread.id]
          return next
        })
        setActiveThread((prev) => {
          if (prev?.id === thread.id) {
            return null
          }
          return prev
        })
      } catch (error) {
        throw error
      }
    },
    [setActiveThread, setThreads, updateConversationMap]
  )

  return {
    projects: {
      list: projects,
      active: activeProject,
      isLoading: projectsLoading,
      error: projectsError,
      select: selectProject,
      register: registerProject,
      remove: deleteProject
    },
    threads: {
      list: threads,
      sections,
      isLoading: threadsLoading,
      error: threadsError,
      active: activeThread,
      select: handleThreadSelect,
      newThread: handleNewThread,
      rename: renameThread,
      remove: deleteThread
    },
    conversation: {
      list: conversation
    },
    stream: {
      isStreaming,
      status,
      usage,
      error: streamError,
      setError: setStreamError,
      send: sendMessage,
      cancel: cancelStream
    },
    selection: {
      thread: selectedThread
    }
  }
}

function formatUsageSummary(usage?: AgentUsage): string {
  if (!usage) {
    return "Turn completed"
  }
  return `Usage · in ${usage.inputTokens} / out ${usage.outputTokens}`
}
