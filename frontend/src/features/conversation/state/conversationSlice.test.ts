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

  it("allows updating entries via updater", () => {
    store.getState().ensureConversation(9)
    store.getState().updateConversationEntries(9, () => [
      { id: "sys", role: "system", createdAt: "2024", message: "Ready", tone: "info", meta: {} }
    ])

    expect(store.getState().conversationByThreadId[9]).toHaveLength(1)
  })
})

function createConversationStore(bridge: PlatformBridge) {
  return createStore<ConversationSlice>()(createConversationSlice(bridge))
}
