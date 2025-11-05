import { useCallback, useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { GetThread, ListThreads } from "../../wailsjs/go/agents/API"
import { mapThreadDtoToThread } from "@/lib/threads"
import type { AgentThread } from "@/types/app"

export function useAgentThreads(projectId: number | null) {
  const queryClient = useQueryClient()

  const threadsQuery = useQuery({
    queryKey: ["threads", projectId],
    queryFn: async (): Promise<AgentThread[]> => {
      if (!projectId) {
        return []
      }
      const response = await ListThreads(projectId)
      return response.map(mapThreadDtoToThread)
    },
    enabled: Boolean(projectId),
    staleTime: 15_000,
    gcTime: 60_000
  })

  const mutation = useMutation({
    mutationFn: async (threadId: number) => {
      const dto = await GetThread(threadId)
      return mapThreadDtoToThread(dto)
    },
    onSuccess: (thread) => {
      queryClient.setQueryData<AgentThread[]>(["threads", thread.projectId], (prev = []) => {
        const index = prev.findIndex((item) => item.id === thread.id)
        if (index >= 0) {
          const clone = [...prev]
          clone[index] = thread
          return clone
        }
        return [thread, ...prev]
      })
    }
  })

  const refreshThread = useCallback(async (threadId: number) => {
    const thread = await mutation.mutateAsync(threadId)
    return thread
  }, [mutation])

  const threads = useMemo(() => {
    if (!projectId) {
      return []
    }
    return threadsQuery.data ?? []
  }, [projectId, threadsQuery.data])

  return {
    threads,
    isLoading: threadsQuery.isPending || threadsQuery.isFetching,
    error: threadsQuery.error ? (threadsQuery.error instanceof Error ? threadsQuery.error.message : "Failed to load threads") : null,
    loadThreads: () => threadsQuery.refetch(),
    refreshThread,
    setThreads: (updater: (prev: AgentThread[]) => AgentThread[]) => {
      queryClient.setQueryData<AgentThread[]>(["threads", projectId], (prev = []) => updater(prev))
    }
  }
}
