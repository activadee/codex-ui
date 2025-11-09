import { describe, expect, it } from "vitest"
import { createStore } from "zustand/vanilla"

import { createTerminalSlice, getIdleTerminalSession, type TerminalSlice } from "./terminalSlice"

function createSlice() {
  return createStore<TerminalSlice>()(createTerminalSlice)
}

describe("terminalSlice", () => {
  it("initializes idle sessions lazily", () => {
    const store = createSlice()
    expect(store.getState().terminalSessions[1]).toBeUndefined()
    store.getState().setTerminalSession(1, () => ({ status: "connecting", error: null, exitStatus: null }))
    expect(store.getState().terminalSessions[1]?.status).toBe("connecting")
  })

  it("resets terminal sessions", () => {
    const store = createSlice()
    store.getState().setTerminalSession(2, () => ({ status: "ready", error: null, exitStatus: null }))
    store.getState().resetTerminalSession(2)
    expect(store.getState().terminalSessions[2]).toBeUndefined()
  })

  it("provides a reusable idle snapshot", () => {
    const idle = getIdleTerminalSession()
    expect(idle.status).toBe("idle")
    expect(idle.error).toBeNull()
  })
})
