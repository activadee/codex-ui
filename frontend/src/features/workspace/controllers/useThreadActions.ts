import { useCallback } from "react"

import { threadToListItem } from "@/domain/threads"
import { useAppStore } from "@/state/createAppStore"
import type { ThreadListItem } from "@/types/app"

type ThreadActionsDependencies = {
  activeThread: ThreadListItem | null
  setActiveThread: (thread: ThreadListItem | null) => void
  updateStreamError: (message: string | null, threadId?: number) => void
}

export function useThreadActions({ activeThread, setActiveThread, updateStreamError }: ThreadActionsDependencies) {
  const renameThreadAction = useAppStore((state) => state.renameThread)
  const deleteThreadAction = useAppStore((state) => state.deleteThread)
  const clearConversation = useAppStore((state) => state.clearConversation)

  const renameThread = useCallback(
    async (thread: ThreadListItem, title: string) => {
      const updated = await renameThreadAction(thread.id, title)
      if (activeThread && activeThread.id === updated.id) {
        setActiveThread(threadToListItem(updated))
      }
    },
    [activeThread, renameThreadAction, setActiveThread]
  )

  const deleteThread = useCallback(
    async (thread: ThreadListItem) => {
      await deleteThreadAction(thread.id)
      clearConversation(thread.id)
      if (activeThread?.id === thread.id) {
        setActiveThread(null)
      }
      updateStreamError(null, thread.id)
    },
    [activeThread?.id, clearConversation, deleteThreadAction, setActiveThread, updateStreamError]
  )

  return {
    renameThread,
    deleteThread
  }
}
