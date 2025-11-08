import { useCallback, useEffect } from "react"
import { useAppStore } from "@/state/createAppStore"
import type { AgentThread } from "@/types/app"

export function useAgentThreads(projectId: number | null) {
  const threads = useAppStore((state) => (projectId ? state.threadsByProjectId[projectId] ?? [] : []))
  const isLoading = useAppStore((state) => (projectId ? state.loadingThreadsByProjectId[projectId] ?? false : false))
  const error = useAppStore((state) => (projectId ? state.threadErrorsByProjectId[projectId] ?? null : null))
  const hasLoaded = useAppStore((state) => (projectId ? state.loadedThreadsByProjectId[projectId] ?? false : false))
  const loadThreads = useAppStore((state) => state.loadThreads)
  const refreshThreadAction = useAppStore((state) => state.refreshThread)
  const replaceThreads = useAppStore((state) => state.replaceThreads)

  useEffect(() => {
    if (projectId && !hasLoaded) {
      void loadThreads(projectId)
    }
  }, [projectId, hasLoaded, loadThreads])

  const refreshThread = useCallback(
    (threadId: number) => refreshThreadAction(threadId),
    [refreshThreadAction]
  )

  const setThreads = useCallback(
    (updater: (prev: AgentThread[]) => AgentThread[]) => {
      if (!projectId) {
        return
      }
      replaceThreads(projectId, updater)
    },
    [projectId, replaceThreads]
  )

  const triggerLoad = useCallback(() => {
    if (!projectId) {
      return Promise.resolve([])
    }
    return loadThreads(projectId)
  }, [loadThreads, projectId])

  return {
    threads,
    isLoading,
    error,
    loadThreads: triggerLoad,
    refreshThread,
    setThreads
  }
}
