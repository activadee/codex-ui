import { useCallback, type Dispatch, type SetStateAction } from "react"

import { mapThreadDtoToThread, threadToListItem } from "@/domain/threads"
import { platformBridge } from "@/platform/wailsBridge"
import { useAppStore } from "@/state/createAppStore"
import type { AgentThread, ThreadListItem } from "@/types/app"

type ThreadActionsDependencies = {
  setThreads: (updater: (prev: AgentThread[]) => AgentThread[]) => void
  setActiveThread: Dispatch<SetStateAction<ThreadListItem | null>>
  updateStreamError: (message: string | null, threadId?: number) => void
}

export function useThreadActions({ setThreads, setActiveThread, updateStreamError }: ThreadActionsDependencies) {
  const clearConversation = useAppStore((state) => state.clearConversation)

  const renameThread = useCallback(
    async (thread: ThreadListItem, title: string) => {
      const updated = await platformBridge.threads.rename(thread.id, title)
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
      setActiveThread((prev) => {
        if (!updatedThread || !prev || prev.id !== updatedThread.id) {
          return prev
        }
        return threadToListItem(updatedThread)
      })
    },
    [setActiveThread, setThreads]
  )

  const deleteThread = useCallback(
    async (thread: ThreadListItem) => {
      await platformBridge.threads.delete(thread.id)
      setThreads((prev) => prev.filter((existing) => existing.id !== thread.id))
      clearConversation(thread.id)
      setActiveThread((prev) => {
        if (prev?.id === thread.id) {
          return null
        }
        return prev
      })
      updateStreamError(null, thread.id)
    },
    [clearConversation, setActiveThread, setThreads, updateStreamError]
  )

  return {
    renameThread,
    deleteThread
  }
}
