import { useEffect, useMemo, useState, useCallback } from "react"

import { threadToListItem } from "@/lib/threads"
import type { AgentThread, ThreadListItem } from "@/types/app"

export function useThreadSelection(threads: AgentThread[]) {
  const [activeThread, setActiveThread] = useState<ThreadListItem | null>(null)

  useEffect(() => {
    if (!threads.length) {
      setActiveThread(null)
      return
    }
    setActiveThread((prev) => {
      if (prev) {
        const existing = threads.find((thread) => thread.id === prev.id)
        if (existing) {
          return threadToListItem(existing)
        }
      }
      return threadToListItem(threads[0])
    })
  }, [threads])

  const threadId = activeThread?.id ?? null
  const selectedThread = useMemo(() => {
    if (!activeThread) {
      return null
    }
    return threads.find((thread) => thread.id === activeThread.id) ?? null
  }, [activeThread, threads])

  const handleThreadSelect = useCallback((thread: ThreadListItem) => {
    setActiveThread(thread)
  }, [])

  return {
    activeThread,
    setActiveThread,
    threadId,
    selectedThread,
    handleThreadSelect
  }
}
