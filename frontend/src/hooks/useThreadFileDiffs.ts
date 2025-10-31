import { useCallback, useEffect, useRef, useState } from "react"

import { ListThreadFileDiffs } from "../../wailsjs/go/main/App"
import { EventsOn } from "../../wailsjs/runtime/runtime"
import { fileChangeTopic } from "@/lib/threads"
import type { FileDiffStat } from "@/types/app"

type FileDiffEvent = {
  threadId: number
  files: FileDiffStat[]
}

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
  const listenerRef = useRef<(() => void) | null>(null)
  const activeThreadRef = useRef<number | undefined>(threadId)

  const loadFiles = useCallback(async () => {
    if (!threadId) {
      setFiles([])
      setError(null)
      return
    }
    setIsLoading(true)
    try {
      const diffs = await ListThreadFileDiffs(threadId)
      setFiles(diffs ?? [])
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load file changes"
      setError(message)
      setFiles([])
    } finally {
      setIsLoading(false)
    }
  }, [threadId])

  useEffect(() => {
    activeThreadRef.current = threadId
    void loadFiles()
  }, [loadFiles, threadId])

  useEffect(() => {
    if (!threadId) {
      if (listenerRef.current) {
        listenerRef.current()
        listenerRef.current = null
      }
      return
    }
    const topic = fileChangeTopic(threadId)
    const handleEvent = (payload: FileDiffEvent) => {
      if (!payload || payload.threadId !== threadId) {
        return
      }
      setFiles(payload.files ?? [])
    }
    listenerRef.current = EventsOn(topic, handleEvent)
    return () => {
      if (listenerRef.current) {
        listenerRef.current()
        listenerRef.current = null
      }
    }
  }, [threadId])

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
