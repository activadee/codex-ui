import { useCallback } from "react"

import { agents } from "@/wailsjs/go/models"
import { threadToListItem } from "@/domain/threads"
import type {
  AgentThread,
  ThreadListItem,
  UserConversationEntry,
  UserMessageSegment
} from "@/types/app"

type SendMessageOptions = {
  content: string
  model: string
  sandbox: string
  reasoning: string
  attachmentPaths?: string[]
  segments?: UserMessageSegment[]
}

type MessageSenderDependencies = {
  activeProject: { id: number } | null
  activeThread: ThreadListItem | null
  threads: AgentThread[]
  startStream: (request: agents.MessageRequest) => Promise<{ threadId: number; streamId?: string }>
  ensureTimeline: (threadId: number) => void
  appendUserEntry: (threadId: number, entry: UserConversationEntry) => void
  refreshThread: (threadId: number) => Promise<AgentThread>
  setActiveThread: (thread: ThreadListItem | null) => void
  syncThreadPreviewFromConversation: (threadId: number) => void
  updateStreamError: (message: string | null, threadId?: number) => void
  registerPendingAttachments: (streamId: string | undefined, paths: string[]) => void
}

export function useMessageSender({
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
}: MessageSenderDependencies) {
  return useCallback(
    async ({
      content,
      model,
      sandbox,
      reasoning,
      segments,
      attachmentPaths
    }: SendMessageOptions): Promise<number | undefined> => {
      if (!activeProject) {
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

      const streamAttachments = attachmentPaths?.filter((path) => path.trim() !== "") ?? []
      registerPendingAttachments(handle.streamId, streamAttachments)

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
}
