import { useCallback, type Dispatch, type SetStateAction } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { DeleteThread, RenameThread } from "../../../../wailsjs/go/agents/API"
import { mapThreadDtoToThread } from "@/lib/threads"
import type { AgentThread, ThreadListItem } from "@/types/app"

type ThreadActionsDependencies = {
  setThreads: (updater: (prev: AgentThread[]) => AgentThread[]) => void
  setActiveThreadId: Dispatch<SetStateAction<number | null>>
  updateStreamError: (message: string | null, threadId?: number) => void
}

export function useThreadActions({ setThreads, setActiveThreadId, updateStreamError }: ThreadActionsDependencies) {
  const queryClient = useQueryClient()

  const renameThread = useCallback(
    async (thread: ThreadListItem, title: string) => {
      const updated = await RenameThread(thread.id, title)
      const mapped = mapThreadDtoToThread(updated)
      let updatedThread: AgentThread | null = null
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
    },
    [setThreads]
  )

  const deleteThread = useCallback(
    async (thread: ThreadListItem) => {
      await DeleteThread(thread.id)
      setThreads((prev) => prev.filter((existing) => existing.id !== thread.id))
      queryClient.removeQueries({ queryKey: ["conversation", thread.id] })
      setActiveThreadId((prev) => (prev === thread.id ? null : prev))
      updateStreamError(null, thread.id)
    },
    [queryClient, setActiveThreadId, setThreads, updateStreamError]
  )

  return {
    renameThread,
    deleteThread
  }
}
