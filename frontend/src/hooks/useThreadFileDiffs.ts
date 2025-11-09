import { useCallback, useEffect } from "react"

import { useThreadEventRouter, type FileDiffEvent } from "@/eventing"
import { useAppStore } from "@/state/createAppStore"
import type { FileDiffStat } from "@/types/app"

type UseThreadFileDiffsResponse = {
  files: FileDiffStat[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useThreadFileDiffs(threadId?: number): UseThreadFileDiffsResponse {
  const router = useThreadEventRouter()
  const files = useAppStore((state) => (threadId ? state.diffsByThreadId[threadId] ?? [] : []))
  const isLoading = useAppStore((state) => (threadId ? state.loadingDiffsByThreadId[threadId] ?? false : false))
  const error = useAppStore((state) => (threadId ? state.diffErrorsByThreadId[threadId] ?? null : null))
  const loadDiffsAction = useAppStore((state) => state.loadDiffs)
  const setDiffsFromEvent = useAppStore((state) => state.setDiffsFromEvent)

  const loadFiles = useCallback(async () => {
    if (!threadId) {
      return
    }
    const currentThreadId = threadId
    try {
      await loadDiffsAction(currentThreadId)
    } catch (err) {
      console.error("Failed to load file changes", err)
    }
  }, [loadDiffsAction, threadId])

  useEffect(() => {
    activeThreadRef.current = threadId
    void loadFiles()
  }, [loadFiles, threadId])

  useEffect(() => {
    if (!threadId) {
      return
    }
    const unsubscribe = router.subscribeToDiffs(threadId, (payload: FileDiffEvent) => {
      setDiffsFromEvent(payload.threadId, payload.files ?? [])
    })
    return () => {
      unsubscribe()
    }
  }, [router, setDiffsFromEvent, threadId])

  const refresh = useCallback(async () => {
    await loadFiles()
  }, [loadFiles])

  return {
    files,
    isLoading,
    error,
    refresh
  }
}
