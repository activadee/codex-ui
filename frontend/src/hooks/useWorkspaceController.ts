import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

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
import { useThreadConversation, normaliseConversation } from "@/hooks/useThreadConversation"

type SendMessageOptions = {
  content: string
  model: string
  sandbox: string
  reasoning: string
  attachmentPaths?: string[]
  segments?: UserMessageSegment[]
}

type StreamErrorMap = Partial<Record<number, string>> & { global?: string }

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

  const [streamErrors, setStreamErrors] = useState<StreamErrorMap>({})
  const pendingAttachmentsRef = useRef<Map<string, string[]>>(new Map())

  const updateStreamError = useCallback((message: string | null, threadId?: number) => {
    const key = typeof threadId === "number" ? threadId : "global"
    setStreamErrors((prev) => {
      const next: StreamErrorMap = { ...prev }
      if (!message) {
        if (key === "global") {
          if (!("global" in next)) {
            return prev
          }
          delete next.global
          return next
        }
        if (!(key in next)) {
          return prev
        }
        delete next[key]
        return next
      }
      next[key] = message
      return next
    })
  }, [])

  const queryClient = useQueryClient()

  const ensureTimeline = useCallback(
    (threadId: number) => {
      if (threadId <= 0) {
        return
      }
      queryClient.setQueryData<ConversationEntry[]>(["conversation", threadId], (prev) => prev ?? [])
    },
    [queryClient]
  )

  const getConversationEntries = useCallback(
    (threadId: number): ConversationEntry[] => {
      if (threadId <= 0) {
        return []
      }
      return queryClient.getQueryData<ConversationEntry[]>(["conversation", threadId]) ?? []
    },
    [queryClient]
  )

  const updateConversationEntries = useCallback(
    (threadId: number, updater: (entries: ConversationEntry[]) => ConversationEntry[]) => {
      if (threadId <= 0) {
        return
      }
      queryClient.setQueryData<ConversationEntry[]>(["conversation", threadId], (prev = []) => updater(prev))
    },
    [queryClient]
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
        const normalized = normaliseConversation(response)
        queryClient.setQueryData<ConversationEntry[]>(["conversation", threadId], normalized)
        applyPreviewFromEntries(threadId, normalized)
        return normalized
      } catch (error) {
        console.error("Failed to load conversation", error)
        return [] as ConversationEntry[]
      }
    },
    [applyPreviewFromEntries, queryClient]
  )

  const appendUserEntry = useCallback(
    (threadId: number, entry: UserConversationEntry) => {
      ensureTimeline(threadId)
      updateConversationEntries(threadId, (existing) => [...existing, entry])
      if (entry.text.trim()) {
        applyThreadPreview(threadId, entry.text, entry.createdAt)
      }
    },
    [applyThreadPreview, ensureTimeline, updateConversationEntries]
  )

  const upsertAgentEntry = useCallback(
    (threadId: number, item: AgentItemPayload) => {
      const identifier = item.id && item.id.trim() ? item.id : `agent-${Date.now().toString(36)}`
      const timestamp = new Date().toISOString()
      ensureTimeline(threadId)
      updateConversationEntries(threadId, (existing) => {
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
    [applyThreadPreview, ensureTimeline, updateConversationEntries]
  )

  const appendSystemEntry = useCallback(
    (threadId: number, entry: SystemConversationEntry) => {
      ensureTimeline(threadId)
      updateConversationEntries(threadId, (existing) => [...existing, entry])
    },
    [ensureTimeline, updateConversationEntries]
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
  const { entries: conversationEntries } = useThreadConversation(threadId)


  const { startStream, cancelStream, getThreadState } = useAgentStream({
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

      updateStreamError(null, threadIdFromStream)
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
    onError: (message, context) => {
      updateStreamError(message, context.threadId)
    }
  })

  const threadStreamState = useMemo(
    () => getThreadState(threadId ?? undefined),
    [getThreadState, threadId]
  )
  const isThreadStreaming = threadStreamState.status === "streaming"

  useEffect(() => {
    if (!threadId) {
      return
    }
    ensureTimeline(threadId)
    if (isThreadStreaming) {
      return
    }
    void loadConversation(threadId)
  }, [ensureTimeline, isThreadStreaming, loadConversation, threadId])

  const handleThreadSelect = useCallback(
    (thread: ThreadListItem) => {
      setActiveThread(thread)
    },
    []
  )

  const handleNewThread = useCallback(() => {
    setActiveThread(null)
    updateStreamError(null)
  }, [updateStreamError])

  const sendMessage = useCallback(
    async ({
      content,
      model,
      sandbox,
      reasoning,
      segments,
      attachmentPaths
    }: SendMessageOptions): Promise<number | undefined> => {
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
        return undefined
      }

      updateStreamError(null, activeThread?.id ?? undefined)

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
      return handle.threadId
    },
    [
      activeProject,
      activeThread,
      appendUserEntry,
      ensureTimeline,
      refreshThread,
      startStream,
      syncThreadPreviewFromConversation,
      threads,
      updateStreamError
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
        queryClient.removeQueries({ queryKey: ["conversation", thread.id] })
        setActiveThread((prev) => {
          if (prev?.id === thread.id) {
            return null
          }
          return prev
        })
        updateStreamError(null, thread.id)
      } catch (error) {
        throw error
      }
    },
    [queryClient, setActiveThread, setThreads, updateStreamError]
  )

  const streamStatus = threadStreamState.status
  const streamUsage = threadStreamState.usage
  const stateError = threadStreamState.error ?? null
  const manualThreadError = threadId ? streamErrors[threadId] ?? null : null
  const globalError = streamErrors.global ?? null
  const activeStreamError = manualThreadError ?? stateError ?? globalError ?? null

  const setCurrentStreamError = useCallback(
    (message: string | null) => {
      updateStreamError(message, threadId ?? undefined)
    },
    [threadId, updateStreamError]
  )

  const cancelCurrentStream = useCallback(() => cancelStream(threadId ?? undefined), [cancelStream, threadId])

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
      list: conversationEntries
    },
    stream: {
      isStreaming: isThreadStreaming || getThreadState(undefined).status === "streaming",
      status: streamStatus,
      usage: streamUsage,
      error: activeStreamError,
      setError: setCurrentStreamError,
      send: sendMessage,
      cancel: cancelCurrentStream
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
