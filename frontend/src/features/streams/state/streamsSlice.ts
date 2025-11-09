import type { StateCreator } from "zustand"

import type { AgentUsage } from "@/types/app"

export type StreamStatus = "idle" | "streaming" | "completed" | "stopped" | "error"

export type ThreadStreamState = {
  streamId?: string
  status: StreamStatus
  usage?: AgentUsage
  error?: string | null
}

const idleState: ThreadStreamState = {
  status: "idle",
  error: null
}

export type StreamsSlice = {
  threadStreams: Record<number, ThreadStreamState>
  setThreadStreamState: (
    threadId: number,
    updater: (prev: ThreadStreamState) => ThreadStreamState
  ) => void
  resetThreadStream: (threadId: number) => void
}

export const createStreamsSlice: StateCreator<StreamsSlice, [], []> = (set) => ({
  threadStreams: {},
  setThreadStreamState: (threadId, updater) => {
    if (threadId <= 0) {
      return
    }
    set((state) => {
      const current = state.threadStreams[threadId] ?? idleState
      return {
        ...state,
        threadStreams: {
          ...state.threadStreams,
          [threadId]: updater(current)
        }
      }
    })
  },
  resetThreadStream: (threadId) => {
    if (threadId <= 0) {
      return
    }
    set((state) => {
      const next = { ...state.threadStreams }
      next[threadId] = idleState
      return {
        ...state,
        threadStreams: next
      }
    })
  }
})
