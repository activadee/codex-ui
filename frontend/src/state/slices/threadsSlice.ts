import type { StateCreator } from "zustand"

import { mapThreadDtoToThread, updateThreadPreview } from "@/domain/threads"
import type { PlatformBridge } from "@/platform/wailsBridge"
import type { AgentThread } from "@/types/app"

export type ThreadsSlice = {
  threadsByProjectId: Record<number, AgentThread[]>
  activeThreadByProjectId: Record<number, number | null>
  loadingThreadsByProjectId: Record<number, boolean>
  loadedThreadsByProjectId: Record<number, boolean>
  threadErrorsByProjectId: Record<number, string | null>
  refreshingThreadIds: Record<number, boolean>
  threadProjectMap: Record<number, number>
  loadThreads: (projectId: number | null) => Promise<AgentThread[]>
  refreshThread: (threadId: number) => Promise<AgentThread | null>
  setActiveThreadId: (projectId: number | null, threadId: number | null) => void
  replaceThreads: (projectId: number, updater: (threads: AgentThread[]) => AgentThread[]) => void
  updateThreadPreview: (threadId: number, previewText: string, occurredAt?: string) => void
}

export const createThreadsSlice = (bridge: PlatformBridge): StateCreator<ThreadsSlice, [], []> => {
  return (set, get) => ({
    threadsByProjectId: {},
    activeThreadByProjectId: {},
    loadingThreadsByProjectId: {},
    loadedThreadsByProjectId: {},
    threadErrorsByProjectId: {},
    refreshingThreadIds: {},
    threadProjectMap: {},
    loadThreads: async (projectId) => {
      if (!projectId) {
        return []
      }
      set((state) => ({
        ...state,
        loadingThreadsByProjectId: { ...state.loadingThreadsByProjectId, [projectId]: true },
        threadErrorsByProjectId: { ...state.threadErrorsByProjectId, [projectId]: null }
      }))
      try {
        const dtos = await bridge.threads.list(projectId)
        const threads = dtos.map(mapThreadDtoToThread)
        set((state) => ({
          ...state,
          threadsByProjectId: { ...state.threadsByProjectId, [projectId]: threads },
          activeThreadByProjectId: {
            ...state.activeThreadByProjectId,
            [projectId]: resolveActiveThreadId(state.activeThreadByProjectId[projectId], threads)
          },
          threadProjectMap: syncProjectMap(state.threadProjectMap, projectId, threads)
        }))
        return threads
      } catch (error) {
        set((state) => ({
          ...state,
          threadErrorsByProjectId: {
            ...state.threadErrorsByProjectId,
            [projectId]: normalizeError(error)
          }
        }))
        throw error
      } finally {
        set((state) => ({
          ...state,
          loadingThreadsByProjectId: { ...state.loadingThreadsByProjectId, [projectId]: false },
          loadedThreadsByProjectId: { ...state.loadedThreadsByProjectId, [projectId]: true }
        }))
      }
    },
    refreshThread: async (threadId) => {
      if (!threadId) {
        return null
      }
      set((state) => ({
        ...state,
        refreshingThreadIds: { ...state.refreshingThreadIds, [threadId]: true }
      }))
      try {
        const dto = await bridge.threads.get(threadId)
        const thread = mapThreadDtoToThread(dto)
        const projectId = thread.projectId
        set((state) => ({
          ...state,
          threadsByProjectId: {
            ...state.threadsByProjectId,
            [projectId]: upsertThread(state.threadsByProjectId[projectId] ?? [], thread)
          },
          threadProjectMap: { ...state.threadProjectMap, [thread.id]: projectId }
        }))
        return thread
      } catch (error) {
        const projectId = get().threadProjectMap[threadId]
        if (projectId) {
          set((state) => ({
            ...state,
            threadErrorsByProjectId: {
              ...state.threadErrorsByProjectId,
              [projectId]: normalizeError(error)
            }
          }))
        }
        throw error
      } finally {
        set((state) => ({
          ...state,
          refreshingThreadIds: { ...state.refreshingThreadIds, [threadId]: false }
        }))
      }
    },
    setActiveThreadId: (projectId, threadId) => {
      if (!projectId) {
        return
      }
      set((state) => ({
        ...state,
        activeThreadByProjectId: { ...state.activeThreadByProjectId, [projectId]: threadId }
      }))
    },
    replaceThreads: (projectId, updater) => {
      if (!projectId) {
        return
      }
      set((state) => {
        const currentThreads = state.threadsByProjectId[projectId] ?? []
        const nextThreads = updater(currentThreads)
        return {
          ...state,
          threadsByProjectId: { ...state.threadsByProjectId, [projectId]: nextThreads },
          threadProjectMap: syncProjectMap(state.threadProjectMap, projectId, nextThreads),
          activeThreadByProjectId: {
            ...state.activeThreadByProjectId,
            [projectId]: resolveActiveThreadId(state.activeThreadByProjectId[projectId], nextThreads)
          }
        }
      })
    },
    updateThreadPreview: (threadId, previewText, occurredAt) => {
      const projectId = get().threadProjectMap[threadId]
      if (!projectId) {
        return
      }
      set((state) => {
        const threads = state.threadsByProjectId[projectId] ?? []
        const index = threads.findIndex((thread) => thread.id === threadId)
        if (index === -1) {
          return state
        }
        const updated = updateThreadPreview(threads[index], previewText, occurredAt)
        const nextThreads = [...threads]
        nextThreads[index] = updated
        return {
          ...state,
          threadsByProjectId: { ...state.threadsByProjectId, [projectId]: nextThreads }
        }
      })
    }
  })
}

function resolveActiveThreadId(currentId: number | null | undefined, threads: AgentThread[]) {
  if (!threads.length) {
    return null
  }
  if (currentId && threads.some((thread) => thread.id === currentId)) {
    return currentId
  }
  return threads[0]?.id ?? null
}

function upsertThread(threads: AgentThread[], next: AgentThread) {
  const index = threads.findIndex((thread) => thread.id === next.id)
  if (index === -1) {
    return [next, ...threads]
  }
  const clone = [...threads]
  clone[index] = next
  return clone
}

function syncProjectMap(
  current: Record<number, number>,
  projectId: number,
  threads: AgentThread[]
): Record<number, number> {
  const next = { ...current }
  const ids = new Set(threads.map((thread) => thread.id))
  Object.entries(next).forEach(([threadId, project]) => {
    if (project === projectId && !ids.has(Number(threadId))) {
      delete next[Number(threadId)]
    }
  })
  threads.forEach((thread) => {
    next[thread.id] = projectId
  })
  return next
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "Unable to load threads"
}
