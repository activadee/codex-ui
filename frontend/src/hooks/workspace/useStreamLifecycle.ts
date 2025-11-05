import { useMemo } from "react"

import { DeleteAttachment } from "../../../wailsjs/go/attachments/API"
import { useAgentStream } from "@/hooks/useAgentStream"
import { threadToListItem } from "@/lib/threads"
import type {
  AgentItemPayload,
  SystemConversationEntry,
  ThreadListItem,
  UserConversationEntry
} from "@/types/app"

function formatUsageSummary(usage?: { inputTokens: number; outputTokens: number }): string {
  if (!usage) {
    return "Turn completed"
  }
  return `Usage · in ${usage.inputTokens} / out ${usage.outputTokens}`
}

export type StreamLifecycleOptions = {
  activeThreadId: number | null
  appendSystemEntry: (threadId: number, entry: SystemConversationEntry) => void
  upsertAgentEntry: (threadId: number, item: AgentItemPayload) => void
  ensureTimeline: (threadId: number) => void
  appendUserEntry: (threadId: number, entry: UserConversationEntry) => void
  refreshThread: (threadId: number) => Promise<any>
  setActiveThread: (thread: ThreadListItem | null) => void
  syncThreadPreviewFromConversation: (threadId: number) => void
  updateStreamError: (message: string | null, threadId?: number) => void
  pendingAttachmentsRef: React.MutableRefObject<Map<string, string[]>>
}

export function useStreamLifecycle(options: StreamLifecycleOptions) {
  const {
    activeThreadId,
    appendSystemEntry,
    upsertAgentEntry,
    ensureTimeline,
    appendUserEntry,
    refreshThread,
    setActiveThread,
    syncThreadPreviewFromConversation,
    updateStreamError,
    pendingAttachmentsRef
  } = options

  const { startStream, cancelStream, getThreadState } = useAgentStream({
    onEvent: (event, context) => {
      const targetThreadId = context.threadId ?? activeThreadId ?? undefined
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

  const threadStreamState = useMemo(() => getThreadState(activeThreadId ?? undefined), [activeThreadId, getThreadState])

  return {
    startStream,
    cancelStream,
    threadStreamState,
    getThreadState
  }
}
