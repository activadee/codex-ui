import { useCallback, useMemo } from "react"

import { threadToListItem } from "@/domain/threads"
import { useAppStore } from "@/state/createAppStore"
import type { ThreadListItem } from "@/types/app"

export function useThreadSelection(projectId: number | null) {
  const threads = useAppStore((state) => (projectId ? state.threadsByProjectId[projectId] ?? [] : []))
  const activeThreadId = useAppStore((state) => (projectId ? state.activeThreadByProjectId[projectId] : undefined))
  const setActiveThreadId = useAppStore((state) => state.setActiveThreadId)

  const selectedThread = useMemo(() => {
    if (!threads.length) {
      return null
    }
    if (activeThreadId === undefined) {
      return threads[0]
    }
    if (activeThreadId === null) {
      return null
    }
    return threads.find((thread) => thread.id === activeThreadId) ?? threads[0]
  }, [activeThreadId, threads])

  const activeThread = useMemo(() => (selectedThread ? threadToListItem(selectedThread) : null), [selectedThread])

  const setActiveThread = useCallback(
    (thread: ThreadListItem | null) => {
      if (!projectId) {
        return
      }
      setActiveThreadId(projectId, thread?.id ?? null)
    },
    [projectId, setActiveThreadId]
  )

  const handleThreadSelect = setActiveThread
  const threadId = selectedThread?.id ?? null

  return {
    activeThread,
    setActiveThread,
    threadId,
    selectedThread,
    handleThreadSelect
  }
}
