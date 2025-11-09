import type { StateCreator } from "zustand"

export type TerminalStatus = "idle" | "connecting" | "ready" | "exited" | "error"

export type TerminalSessionState = {
  status: TerminalStatus
  error: string | null
  exitStatus: string | null
}

export type TerminalSlice = {
  terminalSessions: Record<number, TerminalSessionState>
  setTerminalSession: (
    threadId: number,
    updater: (prev: TerminalSessionState) => TerminalSessionState
  ) => void
  resetTerminalSession: (threadId: number) => void
}

const idleSession: TerminalSessionState = {
  status: "idle",
  error: null,
  exitStatus: null
}

export const createTerminalSlice: StateCreator<TerminalSlice, [], []> = (set) => ({
  terminalSessions: {},
  setTerminalSession: (threadId, updater) => {
    if (threadId <= 0) {
      return
    }
    set((state) => ({
      ...state,
      terminalSessions: {
        ...state.terminalSessions,
        [threadId]: updater(state.terminalSessions[threadId] ?? idleSession)
      }
    }))
  },
  resetTerminalSession: (threadId) => {
    if (threadId <= 0) {
      return
    }
    set((state) => {
      if (!state.terminalSessions[threadId]) {
        return state
      }
      const next = { ...state.terminalSessions }
      delete next[threadId]
      return {
        ...state,
        terminalSessions: next
      }
    })
  }
})

export function getIdleTerminalSession(): TerminalSessionState {
  return idleSession
}
