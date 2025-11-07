import { useCallback, useEffect, useMemo, useState } from "react"
import { useQueryClient, type InfiniteData } from "@tanstack/react-query"

import type {
  AgentConversationEntry,
  AgentItemPayload,
  ConversationEntry,
  SystemConversationEntry,
  ThreadListItem,
  UserConversationEntry,
  UserMessageSegment
} from "@/types/app"
import { DeleteAttachment } from "../../wailsjs/go/attachments/API"
import { LoadThreadConversationPage } from "../../wailsjs/go/agents/API"
import { agents } from "../../wailsjs/go/models"
import { useProjects } from "@/hooks/useProjects"
import { useAgentThreads } from "@/hooks/useAgentThreads"
import { useThreadConversation, normaliseConversation } from "@/hooks/useThreadConversation"
import { useAgentStream } from "@/hooks/useAgentStream"
import { useThreadEventRouter } from "@/lib/thread-events"
import { usePendingAttachments } from "@/hooks/workspace/controller/usePendingAttachments"
import { useStreamErrors } from "@/hooks/workspace/controller/useStreamErrors"
import { useThreadActions } from "@/hooks/workspace/controller/useThreadActions"
import { formatThreadSections, threadToListItem, updateThreadPreview } from "@/lib/threads"

function formatUsageSummary(usage?: { inputTokens: number; outputTokens: number }): string {
  if (!usage) {
    return "Turn completed"
  }
  return `Usage · in ${usage.inputTokens} / out ${usage.outputTokens}`
}

type SendMessageOptions = {
  content: string
  model: string
  sandbox: string
  reasoning: string
  attachmentPaths?: string[]
  segments?: UserMessageSegment[]
}

type ConversationPageState = {
  entries: ConversationEntry[]
  nextCursor?: string
  hasMore: boolean
}

const PAGE_SIZE = 30

export function useWorkspaceController() {
  const queryClient = useQueryClient()
  const router = useThreadEventRouter()
  const {
    projects,
    activeProject,
    isLoading: projectsLoading,
    error: projectsError,
    selectProject,
    registerProject,
    deleteProject
  } = useProjects()

  const { streamErrors, updateStreamError, getErrorForThread } = useStreamErrors()
  const { pendingAttachmentsRef, registerPendingAttachments } = usePendingAttachments()

  const projectId = activeProject?.id ?? null
  const {
    threads,
    isLoading: threadsLoading,
    error: threadsError,
    refreshThread,
    setThreads
  } = useAgentThreads(projectId)

  const sections = useMemo(() => formatThreadSections(threads), [threads])

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
      queryClient.setQueryData<InfiniteData<ConversationPageState>>(["conversation", threadId], (prev) => {
        if (prev) {
          return prev
        }
        return {
          pages: [{ entries: [], nextCursor: undefined, hasMore: false }],
          pageParams: [undefined]
        }
      })
    },
    [normaliseConversation, queryClient]
  )

  const getConversationEntries = useCallback(
    (threadId: number): ConversationEntry[] => {
      if (threadId <= 0) {
        return []
      }
      const data = queryClient.getQueryData<InfiniteData<ConversationPageState>>(["conversation", threadId])
      if (!data) {
        return []
      }
      return [...data.pages]
        .reverse()
        .flatMap((page) => page.entries ?? [])
    },
    [queryClient]
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

  const appendUserEntry = useCallback(
    (threadId: number, entry: UserConversationEntry) => {
      ensureTimeline(threadId)
      queryClient.setQueryData<InfiniteData<ConversationPageState>>(["conversation", threadId], (prev) => {
        if (!prev) {
          return {
            pages: [{ entries: [entry], nextCursor: undefined, hasMore: false }],
            pageParams: [undefined]
          }
        }
        const pageParams = prev.pageParams ? [...prev.pageParams] : []
        const pages = prev.pages.map((page) => ({ ...page, entries: [...page.entries] }))
        if (pages.length === 0) {
          pages.push({ entries: [], nextCursor: undefined, hasMore: false })
          pageParams.push(undefined)
        }
        pages[0] = { ...pages[0], entries: [...pages[0].entries, entry] }
        return { pages, pageParams }
      })
      if (entry.text?.trim()) {
        applyThreadPreview(threadId, entry.text, entry.createdAt)
      }
    },
    [applyThreadPreview, ensureTimeline, queryClient]
  )

  const upsertAgentEntry = useCallback(
    (threadId: number, item: AgentItemPayload) => {
      const identifier = item.id && item.id.trim() ? item.id : `agent-${Date.now().toString(36)}`
      const timestamp = new Date().toISOString()
      ensureTimeline(threadId)
      queryClient.setQueryData<InfiniteData<ConversationPageState>>(["conversation", threadId], (prev) => {
        const nextEntry: AgentConversationEntry = {
          id: identifier,
          role: "agent",
          createdAt: timestamp,
          updatedAt: timestamp,
          item: { ...item, id: identifier }
        }
        if (!prev) {
          return {
            pages: [{ entries: [nextEntry], nextCursor: undefined, hasMore: false }],
            pageParams: [undefined]
          }
        }
        const pageParams = prev.pageParams ? [...prev.pageParams] : []
        const pages = prev.pages.map((page) => ({ ...page, entries: [...page.entries] }))
        let updated = false
        for (const page of pages) {
          const index = page.entries.findIndex((entry) => entry.role === "agent" && entry.id === identifier)
          if (index >= 0) {
            const current = page.entries[index] as AgentConversationEntry
            page.entries[index] = {
              ...current,
              item: { ...item, id: identifier },
              updatedAt: timestamp
            }
            updated = true
            break
          }
        }
        if (!updated) {
          if (pages.length === 0) {
            pages.push({ entries: [], nextCursor: undefined, hasMore: false })
            pageParams.push(undefined)
          }
          pages[0] = { ...pages[0], entries: [...pages[0].entries, nextEntry] }
        }
        return { pages, pageParams }
      })

      if (item.type === "agent_message" && item.text) {
        applyThreadPreview(threadId, item.text, timestamp)
      }
    },
    [applyThreadPreview, ensureTimeline, queryClient]
  )

  const appendSystemEntry = useCallback(
    (threadId: number, entry: SystemConversationEntry) => {
      ensureTimeline(threadId)
      queryClient.setQueryData<InfiniteData<ConversationPageState>>(["conversation", threadId], (prev) => {
        if (!prev) {
          return {
            pages: [{ entries: [entry], nextCursor: undefined, hasMore: false }],
            pageParams: [undefined]
          }
        }
        const pageParams = prev.pageParams ? [...prev.pageParams] : []
        const pages = prev.pages.map((page) => ({ ...page, entries: [...page.entries] }))
        if (pages.length === 0) {
          pages.push({ entries: [], nextCursor: undefined, hasMore: false })
          pageParams.push(undefined)
        }
        pages[0] = { ...pages[0], entries: [...pages[0].entries, entry] }
        return { pages, pageParams }
      })
    },
    [ensureTimeline, queryClient]
  )

  const syncThreadPreviewFromConversation = useCallback(
    (threadId: number) => {
      const entries = getConversationEntries(threadId)
      if (!entries.length) {
        return
      }
      applyPreviewFromEntries(threadId, entries)
    },
    [applyPreviewFromEntries, getConversationEntries]
  )

  const prefetchConversation = useCallback(
    async (threadId: number | null) => {
      if (!threadId || threadId <= 0) {
        return
      }
      const existing = queryClient.getQueryData<InfiniteData<ConversationPageState>>(["conversation", threadId])
      if (existing) {
        return
      }
      try {
        const response = await LoadThreadConversationPage({ threadId, limit: PAGE_SIZE })
        const page: ConversationPageState = {
          entries: normaliseConversation(response.entries ?? []),
          nextCursor: response.nextCursor,
          hasMore: Boolean(response.hasMore)
        }
        queryClient.setQueryData<InfiniteData<ConversationPageState>>(["conversation", threadId], {
          pages: [page],
          pageParams: [undefined]
        })
      } catch (error) {
        console.error("Failed to prefetch conversation", error)
      }
    },
    [queryClient]
  )

  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)

  useEffect(() => {
    if (threads.length === 0) {
      if (activeThreadId !== null) {
        setActiveThreadId(null)
      }
      return
    }
    if (activeThreadId && threads.some((thread) => thread.id === activeThreadId)) {
      return
    }
    const nextId = threads[0].id
    setActiveThreadId(nextId)
    void prefetchConversation(nextId)
  }, [threads, activeThreadId, prefetchConversation])

  const selectedThread = useMemo(() => {
    if (!activeThreadId) {
      return null
    }
    return threads.find((thread) => thread.id === activeThreadId) ?? null
  }, [threads, activeThreadId])

  const activeThreadListItem = useMemo(
    () => (selectedThread ? threadToListItem(selectedThread) : null),
    [selectedThread]
  )

  const {
    entries: conversationEntries,
    fetchMore: fetchOlderMessages,
    hasMore: conversationHasMore,
    isFetching: isConversationFetching,
    isFetchingMore: isFetchingOlderMessages
  } = useThreadConversation(activeThreadId)

  useEffect(() => {
    if (!router || !activeThreadId) {
      return
    }
    return router.subscribeToStream(activeThreadId, (event, context) => {
      const targetThreadId = context.threadId ?? activeThreadId
      ensureTimeline(targetThreadId)

      if (event.type === "turn.started") {
        appendSystemEntry(targetThreadId, {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: "info",
          message: "Assistant started thinking"
        })
      }

      if (event.item) {
        upsertAgentEntry(targetThreadId, event.item)
      }

      if (event.type === "turn.completed") {
        appendSystemEntry(targetThreadId, {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: "info",
          message: formatUsageSummary(event.usage)
        })
      }

      if (event.error?.message) {
        appendSystemEntry(targetThreadId, {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: "error",
          message: event.error.message
        })
      }
    })
  }, [router, activeThreadId, appendSystemEntry, ensureTimeline, upsertAgentEntry])

  const { startStream, cancelStream, getThreadState } = useAgentStream({
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
      setActiveThreadId(listItem.id)

      syncThreadPreviewFromConversation(threadIdFromStream)

      if (statusMessage && statusMessage.trim()) {
        appendSystemEntry(threadIdFromStream, {
          id: `system-${Date.now().toString(36)}`,
          role: "system",
          createdAt: new Date().toISOString(),
          tone: statusMessage === "error" ? "error" : "info",
          message: statusMessage
        })
      }
    },
    onError: (message, context) => {
      updateStreamError(message, context.threadId)
    }
  })
  const activeThreadStreamState = useMemo(
    () => getThreadState(activeThreadId ?? undefined),
    [activeThreadId, getThreadState]
  )
  const isThreadStreaming = activeThreadStreamState.status === "streaming"

  useEffect(() => {
    if (!activeThreadId) {
      return
    }
    ensureTimeline(activeThreadId)
  }, [ensureTimeline, activeThreadId])

  useEffect(() => {
    if (!activeThreadId) {
      return
    }
    void prefetchConversation(activeThreadId)
  }, [activeThreadId, prefetchConversation])

  const handleNewThread = useCallback(() => {
    setActiveThreadId(null)
    updateStreamError(null)
  }, [updateStreamError])

  const handleThreadSelect = useCallback((thread: ThreadListItem) => {
    void prefetchConversation(thread.id)
    setActiveThreadId(thread.id)
  }, [prefetchConversation])

  const sendMessage = useCallback(
    async ({ content, model, sandbox, reasoning, segments, attachmentPaths }: SendMessageOptions) => {
      if (!activeProject) {
        throw new Error("No active project selected")
      }

      const trimmed = content.trim()
      const normalizedSegments: UserMessageSegment[] =
        segments
          ?.map((segment) => {
            if (segment.type === "text") {
              const text = segment.text?.trim()
              if (!text) {
                return null
              }
              return { type: "text", text }
            }
            if (segment.type === "image") {
              const imagePath = segment.imagePath?.trim()
              if (!imagePath) {
                return null
              }
              return { type: "image", imagePath }
            }
            return null
          })
          .filter((segment): segment is UserMessageSegment => segment !== null) ?? []

      const hasSegments = normalizedSegments.length > 0
      if (!trimmed && !hasSegments) {
        return undefined
      }

      updateStreamError(null, activeThreadId ?? undefined)

      const existingThread = selectedThread

      const request = agents.MessageRequest.createFrom({
        agentId: "codex",
        projectId: activeProject.id,
        threadId: activeThreadId ?? 0,
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

      const validAttachments = attachmentPaths?.filter((path) => path.trim() !== "") ?? []
      registerPendingAttachments(handle.streamId, validAttachments)

      const record = await refreshThread(handle.threadId)
      const listItem = threadToListItem(record)
      setActiveThreadId(listItem.id)
      syncThreadPreviewFromConversation(handle.threadId)
      return handle.threadId
    },
    [
      activeProject,
      appendUserEntry,
      ensureTimeline,
      refreshThread,
      registerPendingAttachments,
      startStream,
      syncThreadPreviewFromConversation,
      updateStreamError,
      activeThreadId,
      selectedThread,
      setActiveThreadId
    ]
  )

  const { renameThread, deleteThread } = useThreadActions({
    setThreads,
    setActiveThreadId,
    updateStreamError
  })

  const streamStatus = activeThreadStreamState.status
  const streamUsage = activeThreadStreamState.usage
  const stateError = activeThreadStreamState.error ?? null
  const manualThreadError = activeThreadId ? getErrorForThread(activeThreadId) : null
  const globalError = getErrorForThread()
  const activeStreamError = manualThreadError ?? stateError ?? globalError ?? null

  const setCurrentStreamError = useCallback(
    (message: string | null) => {
      updateStreamError(message, activeThreadId ?? undefined)
    },
    [activeThreadId, updateStreamError]
  )

  const cancelCurrentStream = useCallback(() => cancelStream(activeThreadId ?? undefined), [cancelStream, activeThreadId])

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
      active: activeThreadListItem,
      select: handleThreadSelect,
      newThread: handleNewThread,
      rename: renameThread,
      remove: deleteThread
    },
    conversation: {
      list: conversationEntries,
      fetchOlder: fetchOlderMessages,
      hasMore: conversationHasMore,
      isFetching: isConversationFetching,
      isFetchingMore: isFetchingOlderMessages
    },
    stream: {
      isStreaming: isThreadStreaming,
      status: streamStatus,
      usage: streamUsage,
      error: activeStreamError,
      setError: setCurrentStreamError,
      send: sendMessage,
      cancel: cancelCurrentStream
    },
    selection: {
      thread: selectedThread,
      threadId: activeThreadId
    }
  }
}
