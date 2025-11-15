import { useCallback, useEffect } from "react"

import type { ThreadListItem } from "@/types/app"
import { useProjects } from "@/features/projects/hooks/useProjects"
import { useAgentThreads } from "@/features/threads/hooks/useAgentThreads"
import { useThreadConversation } from "@/features/conversation/hooks/useThreadConversation"
import { useConversationManager } from "@/features/workspace/hooks/useConversationManager"
import { useThreadSelection } from "@/features/workspace/hooks/useThreadSelection"
import { useStreamLifecycle } from "@/features/workspace/hooks/useStreamLifecycle"
import { usePendingAttachments } from "@/features/workspace/controllers/usePendingAttachments"
import { useStreamErrors } from "@/features/workspace/controllers/useStreamErrors"
import { useMessageSender } from "@/features/workspace/controllers/useMessageSender"
import { useThreadActions } from "@/features/workspace/controllers/useThreadActions"

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
  const {
    sections,
    appendUserEntry,
    upsertAgentEntry,
    appendSystemEntry,
    ensureTimeline,
    resetAgentEntries,
    syncThreadPreviewFromConversation
  } = conversationManager

  const { activeThread, setActiveThread, threadId, selectedThread, handleThreadSelect } = useThreadSelection(projectId)
  const { entries: conversationEntries } = useThreadConversation(threadId)

  const streamLifecycle = useStreamLifecycle({
    activeThreadId: threadId,
    appendSystemEntry,
    upsertAgentEntry,
    ensureTimeline,
    resetAgentEntries,
    appendUserEntry,
    refreshThread,
    setActiveThread,
    syncThreadPreviewFromConversation,
    updateStreamError,
    pendingAttachmentsRef
  })

  const { startStream, cancelStream, threadStreamState, getThreadState } = streamLifecycle
  const idleStreamState = { status: "idle", error: null } as ReturnType<typeof getThreadState>
  const activeThreadStreamState = threadId ? threadStreamState : idleStreamState
  const isThreadStreaming = activeThreadStreamState.status === "streaming"

  useEffect(() => {
    if (!threadId) {
      return
    }
    ensureTimeline(threadId)
  }, [ensureTimeline, threadId])

  const handleNewThread = useCallback(() => {
    setActiveThread(null)
    updateStreamError(null)
  }, [setActiveThread, updateStreamError])

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
    activeThread,
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
