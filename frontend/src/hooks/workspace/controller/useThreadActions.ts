import { useCallback, type Dispatch, type SetStateAction } from "react"

import { threadToListItem } from "@/domain/threads"
import { useAppStore } from "@/state/createAppStore"
import type { ThreadListItem } from "@/types/app"

type ThreadActionsDependencies = {
  setActiveThread: Dispatch<SetStateAction<ThreadListItem | null>>
  updateStreamError: (message: string | null, threadId?: number) => void
}

export function useThreadActions({ setActiveThread, updateStreamError }: ThreadActionsDependencies) {
  const renameThreadAction = useAppStore((state) => state.renameThread)
  const deleteThreadAction = useAppStore((state) => state.deleteThread)
  const clearConversation = useAppStore((state) => state.clearConversation)

  const renameThread = useCallback(
    async (thread: ThreadListItem, title: string) => {
      const updated = await renameThreadAction(thread.id, title)
      if (!updated) {
        return
      }
      setActiveThread((prev) => {
        if (!prev || prev.id !== updated.id) {
          return prev
        }
        return threadToListItem(updated)
      })
    },
    [renameThreadAction, setActiveThread]
  )

  const deleteThread = useCallback(
    async (thread: ThreadListItem) => {
      await deleteThreadAction(thread.id)
      clearConversation(thread.id)
      setActiveThread((prev) => {
        if (prev?.id === thread.id) {
          return null
        }
        return prev
      })
      updateStreamError(null, thread.id)
    },
    [clearConversation, deleteThreadAction, setActiveThread, updateStreamError]
  )

  return {
    renameThread,
    deleteThread
  }
}
