import { useCallback, useEffect, useState } from "react"

import { GetThread, ListThreads } from "../../wailsjs/go/main/App"
import { mapThreadDtoToThread } from "@/lib/threads"
import type { AgentThread } from "@/types/app"

export function useAgentThreads(projectId: number | null) {
  const [threads, setThreads] = useState<AgentThread[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadThreads = useCallback(async () => {
    if (!projectId) {
      setThreads([])
      return
    }
    setIsLoading(true)
    try {
      const response = await ListThreads(projectId)
      setThreads(response.map(mapThreadDtoToThread))
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load threads"
      setError(message)
      setThreads([])
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    loadThreads()
  }, [loadThreads])

  const refreshThread = useCallback(async (threadId: number) => {
    const dto = await GetThread(threadId)
    const mapped = mapThreadDtoToThread(dto)
    setThreads((prev) => {
      const exists = prev.some((thread) => thread.id === mapped.id)
      if (exists) {
        return prev.map((thread) => (thread.id === mapped.id ? mapped : thread))
      }
      return [mapped, ...prev]
    })
    return mapped
  }, [])

  return {
    threads,
    isLoading,
    error,
    loadThreads,
    refreshThread,
    setThreads
  }
}
