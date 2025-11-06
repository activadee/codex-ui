import { useCallback, useEffect, useMemo } from "react"
import { useQueryClient } from "@tanstack/react-query"

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
import { agents } from "../../wailsjs/go/models"
import { useProjects } from "@/hooks/useProjects"
import { useAgentThreads } from "@/hooks/useAgentThreads"
import { useThreadConversation } from "@/hooks/useThreadConversation"
import { useThreadSelection } from "@/hooks/workspace/useThreadSelection"
import { useAgentStream } from "@/hooks/useAgentStream"
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

export function useWorkspaceController() {
  const queryClient = useQueryClient()
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
      updateConversationEntries(threadId, (existing) => [...existing, entry])
      if (entry.text?.trim()) {
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
      if (!entries.length) {
        return
      }
      applyPreviewFromEntries(threadId, entries)
    },
    [applyPreviewFromEntries, getConversationEntries]
  )

  const { activeThread, setActiveThread, threadId, selectedThread, handleThreadSelect } = useThreadSelection(threads)
  const { entries: conversationEntries } = useThreadConversation(threadId)

  const { startStream, cancelStream, state: streamState } = useAgentStream({
    threadId: threadId ?? undefined,
    onEvent: (event, context) => {
      const targetThreadId = context.threadId ?? threadId ?? undefined
      if (!targetThreadId) {
        return
      }
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
  const isActiveThread = streamState.threadId === threadId
  const activeThreadStreamState = isActiveThread
    ? streamState
    : {
        threadId,
        streamId: undefined,
        status: "idle" as const,
        usage: undefined,
        error: null
      }
  const isThreadStreaming = activeThreadStreamState.status === "streaming"

  useEffect(() => {
    if (!threadId) {
      return
    }
    ensureTimeline(threadId)
  }, [ensureTimeline, threadId])

  useEffect(() => {
    if (!threadId) {
      return
    }
    void queryClient.ensureQueryData({ queryKey: ["conversation", threadId] })
  }, [queryClient, threadId])

  const handleNewThread = useCallback(() => {
    setActiveThread(null)
    updateStreamError(null)
  }, [updateStreamError])

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

      updateStreamError(null, activeThread?.id ?? undefined)

      const existingThread = activeThread ? threads.find((thread) => thread.id === activeThread.id) : undefined

      const request = agents.MessageRequest.createFrom({
        agentId: "codex",
        projectId: activeProject.id,
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

      const validAttachments = attachmentPaths?.filter((path) => path.trim() !== "") ?? []
      registerPendingAttachments(handle.streamId, validAttachments)

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
      registerPendingAttachments,
      setActiveThread,
      startStream,
      syncThreadPreviewFromConversation,
      threads,
      updateStreamError
    ]
  )

  const { renameThread, deleteThread } = useThreadActions({
    setThreads,
    setActiveThread,
    updateStreamError
  })

  const streamStatus = activeThreadStreamState.status
  const streamUsage = activeThreadStreamState.usage
  const stateError = activeThreadStreamState.error ?? null
  const manualThreadError = threadId ? getErrorForThread(threadId) : null
  const globalError = getErrorForThread()
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
      isStreaming: isThreadStreaming,
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
