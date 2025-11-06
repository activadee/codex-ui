import { useCallback, useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"

import type { ThreadListItem } from "@/types/app"
import { useProjects } from "@/hooks/useProjects"
import { useAgentThreads } from "@/hooks/useAgentThreads"
import { useThreadConversation } from "@/hooks/useThreadConversation"
import { useConversationManager } from "@/hooks/workspace/useConversationManager"
import { useThreadSelection } from "@/hooks/workspace/useThreadSelection"
import { useStreamLifecycle } from "@/hooks/workspace/useStreamLifecycle"
import { usePendingAttachments } from "@/hooks/workspace/controller/usePendingAttachments"
import { useStreamErrors } from "@/hooks/workspace/controller/useStreamErrors"
import { useMessageSender } from "@/hooks/workspace/controller/useMessageSender"
import { useThreadActions } from "@/hooks/workspace/controller/useThreadActions"

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

  const conversationManager = useConversationManager({ threads, setThreads })
  const { sections, appendUserEntry, upsertAgentEntry, appendSystemEntry, ensureTimeline, syncThreadPreviewFromConversation } =
    conversationManager

  const { activeThread, setActiveThread, threadId, selectedThread, handleThreadSelect } = useThreadSelection(threads)
  const { entries: conversationEntries } = useThreadConversation(threadId)

  const streamLifecycle = useStreamLifecycle({
    activeThreadId: threadId,
    appendSystemEntry,
    upsertAgentEntry,
    ensureTimeline,
    appendUserEntry,
    refreshThread,
    setActiveThread,
    syncThreadPreviewFromConversation,
    updateStreamError,
    pendingAttachmentsRef
  })

  const { startStream, cancelStream, streamState } = streamLifecycle
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

  const sendMessage = useMessageSender({
    activeProject,
    activeThread,
    threads,
    startStream,
    ensureTimeline,
    appendUserEntry,
    refreshThread,
    setActiveThread,
    syncThreadPreviewFromConversation,
    updateStreamError,
    registerPendingAttachments
  })

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
