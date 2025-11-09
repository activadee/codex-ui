import type { StateCreator } from "zustand"

import { platformBridge } from "@/platform/wailsBridge"
import type { FileDiffStat } from "@/types/app"

export type DiffSlice = {
  diffsByThreadId: Record<number, FileDiffStat[]>
  loadingDiffsByThreadId: Record<number, boolean>
  diffErrorsByThreadId: Record<number, string | null>
  loadDiffs: (threadId: number | null) => Promise<FileDiffStat[]>
  setDiffsFromEvent: (threadId: number, files: FileDiffStat[]) => void
}

export const createDiffSlice: StateCreator<DiffSlice, [], []> = (set) => ({
  diffsByThreadId: {},
  loadingDiffsByThreadId: {},
  diffErrorsByThreadId: {},
  loadDiffs: async (threadId) => {
    if (!threadId) {
      return []
    }
    set((state) => ({
      ...state,
      loadingDiffsByThreadId: { ...state.loadingDiffsByThreadId, [threadId]: true },
      diffErrorsByThreadId: { ...state.diffErrorsByThreadId, [threadId]: null }
    }))
    try {
      const diffs = await platformBridge.threads.listFileDiffs(threadId)
      const normalized = normalizeDiffs(diffs)
      set((state) => ({
        ...state,
        diffsByThreadId: { ...state.diffsByThreadId, [threadId]: normalized }
      }))
      return normalized
    } catch (error) {
      set((state) => ({
        ...state,
        diffErrorsByThreadId: {
          ...state.diffErrorsByThreadId,
          [threadId]: normalizeError(error)
        }
      }))
      throw error
    } finally {
      set((state) => ({
        ...state,
        loadingDiffsByThreadId: { ...state.loadingDiffsByThreadId, [threadId]: false }
      }))
    }
  },
  setDiffsFromEvent: (threadId, files) => {
    if (!threadId) {
      return
    }
    set((state) => ({
      ...state,
      diffsByThreadId: { ...state.diffsByThreadId, [threadId]: files },
      diffErrorsByThreadId: { ...state.diffErrorsByThreadId, [threadId]: null },
      loadingDiffsByThreadId: { ...state.loadingDiffsByThreadId, [threadId]: false }
    }))
  }
})

function normalizeDiffs(raw: { path: string; added?: number; removed?: number; status?: string }[] | undefined): FileDiffStat[] {
  if (!raw) {
    return []
  }
  return raw.map((entry) => ({
    path: entry.path,
    added: entry.added ?? 0,
    removed: entry.removed ?? 0,
    status: entry.status ?? undefined
  }))
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "Failed to load file diffs"
}
