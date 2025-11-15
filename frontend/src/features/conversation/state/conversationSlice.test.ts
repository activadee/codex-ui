import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"

import type { PlatformBridge } from "@/platform/wailsBridge"

import { createConversationSlice, type ConversationSlice } from "./conversationSlice"

function createBridgeMock() {
  const mock = {
    threads: {
      loadConversation: vi.fn()
    }
  }
  return { mock, bridge: mock as unknown as PlatformBridge }
}

describe("conversationSlice", () => {
  let bridge: PlatformBridge
  let mock: ReturnType<typeof createBridgeMock>["mock"]
  let store: ReturnType<typeof createConversationStore>

  beforeEach(() => {
    const handles = createBridgeMock()
    bridge = handles.bridge
    mock = handles.mock
    store = createConversationStore(bridge)
  })

  it("loads and normalizes conversations", async () => {
    mock.threads.loadConversation.mockResolvedValueOnce([
      { id: "1", role: "user", createdAt: "2024-01-01T00:00:00Z", text: "hello" }
    ])

    const entries = await store.getState().loadConversation(5)

    expect(entries).toHaveLength(1)
    expect(store.getState().conversationByThreadId[5]).toHaveLength(1)
    expect(store.getState().loadedConversationByThreadId[5]).toBe(true)
  })

  it("sorts loaded conversations chronologically", async () => {
    mock.threads.loadConversation.mockResolvedValueOnce([
      { id: "b", role: "user", createdAt: "2024-02-02T12:00:00Z", text: "later" },
      { id: "a", role: "user", createdAt: "2024-02-01T12:00:00Z", text: "earlier" }
    ])

    const entries = await store.getState().loadConversation(7)

    expect(entries.map((entry) => entry.id)).toEqual(["a", "b"])
    expect(store.getState().conversationByThreadId[7].map((entry) => entry.id)).toEqual(["a", "b"])
  })

  it("allows updating entries via updater", () => {
    store.getState().ensureConversation(9)
    store.getState().updateConversationEntries(9, () => [
      { id: "sys", role: "system", createdAt: "2024", message: "Ready", tone: "info", meta: {} }
    ])

    expect(store.getState().conversationByThreadId[9]).toHaveLength(1)
  })

  it("sorts updater results to keep chronology", () => {
    store.getState().ensureConversation(10)
    store.getState().updateConversationEntries(10, () => [
      { id: "newer", role: "user", createdAt: "2024-03-02T00:00:00Z", text: "new" },
      { id: "older", role: "user", createdAt: "2024-03-01T00:00:00Z", text: "old" }
    ])

    expect(store.getState().conversationByThreadId[10].map((entry) => entry.id)).toEqual(["older", "newer"])
  })
})

function createConversationStore(bridge: PlatformBridge) {
  return createStore<ConversationSlice>()(createConversationSlice(bridge))
}
