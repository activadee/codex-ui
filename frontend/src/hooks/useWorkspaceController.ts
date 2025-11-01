import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { agents } from "../../wailsjs/go/models"
import { DeleteAttachment, DeleteThread, RenameThread } from "../../wailsjs/go/main/App"
import { mapThreadDtoToThread, threadToListItem } from "@/lib/threads"
import type {
  AgentItemPayload,
  AgentUsage,
  SystemConversationEntry,
  ThreadListItem,
  UserConversationEntry,
  UserMessageSegment
} from "@/types/app"
import { useProjects } from "@/hooks/useProjects"
import { useAgentThreads } from "@/hooks/useAgentThreads"
import { useThreadConversation } from "@/hooks/useThreadConversation"
import { useConversationManager } from "@/hooks/workspace/useConversationManager"
import { useThreadSelection } from "@/hooks/workspace/useThreadSelection"
import { useStreamLifecycle } from "@/hooks/workspace/useStreamLifecycle"

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

  const projectId = activeProject?.id ?? null
  const {
    threads,
    isLoading: threadsLoading,
    error: threadsError,
    refreshThread,
    setThreads
  } = useAgentThreads(projectId)

  const conversationManager = useConversationManager({ threads, setThreads })
  const { sections, loadConversation, appendUserEntry, upsertAgentEntry, appendSystemEntry, ensureTimeline, syncThreadPreviewFromConversation, getConversationEntries } = conversationManager

  const { activeThread, setActiveThread, threadId, selectedThread, handleThreadSelect } = useThreadSelection(threads)
  const { entries: conversationEntries } = useThreadConversation(threadId)


  const streamLifecycle = useStreamLifecycle({
    activeThreadId: threadId,
    appendSystemEntry,
    upsertAgentEntry,
    ensureTimeline,
    appendUserEntry,
    loadConversation,
    refreshThread,
    setActiveThread,
    syncThreadPreviewFromConversation,
    updateStreamError,
    pendingAttachmentsRef
  })

  const { startStream, cancelStream, threadStreamState, getThreadState } = streamLifecycle
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
