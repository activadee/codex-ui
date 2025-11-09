import { describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"

import { platformBridge } from "@/platform/wailsBridge"

import { createDiffSlice, type DiffSlice } from "./diffSlice"

vi.mock("@/platform/wailsBridge", () => {
  return {
    platformBridge: {
      threads: {
        listFileDiffs: vi.fn()
      }
    }
  }
})

const bridge = platformBridge as unknown as {
  threads: { listFileDiffs: ReturnType<typeof vi.fn> }
}

function createSlice() {
  return createStore<DiffSlice>()(createDiffSlice)
}

describe("diffSlice", () => {
  it("loads diffs from the bridge", async () => {
    bridge.threads.listFileDiffs.mockResolvedValueOnce([
      { path: "foo.ts", added: 2, removed: 1, status: "modified" }
    ])
    const store = createSlice()
    const diffs = await store.getState().loadDiffs(5)
    expect(diffs[0]).toEqual({ path: "foo.ts", added: 2, removed: 1, status: "modified" })
    expect(store.getState().diffsByThreadId[5]).toHaveLength(1)
  })

  it("stores errors when load fails", async () => {
    bridge.threads.listFileDiffs.mockRejectedValueOnce(new Error("boom"))
    const store = createSlice()
    await expect(store.getState().loadDiffs(3)).rejects.toThrow()
    expect(store.getState().diffErrorsByThreadId[3]).toBe("boom")
  })

  it("applies diff events without network calls", () => {
    const store = createSlice()
    store.getState().setDiffsFromEvent(9, [{ path: "bar", added: 1, removed: 0 }])
    expect(store.getState().diffsByThreadId[9]).toHaveLength(1)
  })
})
