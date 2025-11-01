import { useCallback, useEffect, useRef, useState } from "react"

import { ListThreadFileDiffs } from "../../wailsjs/go/main/App"
import { useThreadEventRouter, type FileDiffEvent } from "@/lib/thread-events"
import type { FileDiffStat } from "@/types/app"

type UseThreadFileDiffsResponse = {
  files: FileDiffStat[]
  isLoading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useThreadFileDiffs(threadId?: number): UseThreadFileDiffsResponse {
  const [files, setFiles] = useState<FileDiffStat[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const activeThreadRef = useRef<number | undefined>(threadId)
  const router = useThreadEventRouter()

  const loadFiles = useCallback(async () => {
    if (!threadId) {
      setFiles([])
      setError(null)
      setIsLoading(false)
      return
    }
    const currentThreadId = threadId
    setIsLoading(true)
    try {
      const diffs = await ListThreadFileDiffs(currentThreadId)
      if (activeThreadRef.current !== currentThreadId) {
        return
      }
      setFiles(diffs ?? [])
      setError(null)
    } catch (err) {
      if (activeThreadRef.current !== currentThreadId) {
        return
      }
      const message = err instanceof Error ? err.message : "Failed to load file changes"
      setError(message)
      setFiles([])
    } finally {
      if (activeThreadRef.current === currentThreadId) {
        setIsLoading(false)
      }
    }
  }, [threadId])

  useEffect(() => {
    activeThreadRef.current = threadId
    void loadFiles()
  }, [loadFiles, threadId])

  useEffect(() => {
    if (!threadId) {
      return
    }
    const unsubscribe = router.subscribeToDiffs(threadId, (payload: FileDiffEvent) => {
      setFiles(payload.files ?? [])
      setError(null)
      setIsLoading(false)
    })
    return () => {
      unsubscribe()
    }
  }, [router, threadId])

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
