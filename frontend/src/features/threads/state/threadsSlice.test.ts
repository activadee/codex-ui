import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"

import type { agents } from "../../../../wailsjs/go/models"
import type { PlatformBridge } from "@/platform/wailsBridge"

import { createThreadsSlice, type ThreadsSlice } from "./threadsSlice"

function createBridgeMock() {
  const mock = {
    threads: {
      list: vi.fn(),
      get: vi.fn()
    }
  }
  return { mock, bridge: mock as unknown as PlatformBridge }
}

describe("threadsSlice", () => {
  let bridge: PlatformBridge
  let mock: ReturnType<typeof createBridgeMock>["mock"]
  let store: ReturnType<typeof createThreadsStore>

  beforeEach(() => {
    const handles = createBridgeMock()
    bridge = handles.bridge
    mock = handles.mock
    store = createThreadsStore(bridge)
  })

  it("loads threads per project and tracks active selection", async () => {
    mock.threads.list.mockResolvedValueOnce([
      createThreadDto({ id: 1, projectId: 42 }),
      createThreadDto({ id: 2, projectId: 42, status: "completed" })
    ])

    await store.getState().loadThreads(42)

    expect(store.getState().threadsByProjectId[42]).toHaveLength(2)
    expect(store.getState().activeThreadByProjectId[42]).toBe(1)
    expect(store.getState().threadProjectMap[1]).toBe(42)
  })

  it("refreshes individual threads and keeps them in the list", async () => {
    mock.threads.list.mockResolvedValueOnce([
      createThreadDto({ id: 10, projectId: 7, title: "Initial" })
    ])
    await store.getState().loadThreads(7)
    mock.threads.get.mockResolvedValueOnce(createThreadDto({ id: 10, projectId: 7, title: "Updated" }))

    const thread = await store.getState().refreshThread(10)

    expect(thread?.title).toBe("Updated")
    expect(store.getState().threadsByProjectId[7]?.[0]?.title).toBe("Updated")
  })

  it("updates thread preview optimistically", async () => {
    mock.threads.list.mockResolvedValueOnce([
      createThreadDto({ id: 5, projectId: 3, title: "Preview" })
    ])
    await store.getState().loadThreads(3)

    store.getState().updateThreadPreview(5, "New preview")

    expect(store.getState().threadsByProjectId[3]?.[0]?.preview).toBe("New preview")
  })
})

function createThreadsStore(bridge: PlatformBridge) {
  return createStore<ThreadsSlice>()(createThreadsSlice(bridge))
}

function createThreadDto(overrides: Partial<agents.ThreadDTO>): agents.ThreadDTO {
  return {
    id: overrides.id ?? 1,
    projectId: overrides.projectId ?? 1,
    title: overrides.title ?? "Thread",
    model: overrides.model ?? "gpt",
    sandboxMode: overrides.sandboxMode ?? "default",
    reasoningLevel: overrides.reasoningLevel ?? "fast",
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    lastMessageAt: overrides.lastMessageAt,
    preview: overrides.preview,
    branch: overrides.branch,
    branchName: overrides.branchName,
    diffStat: overrides.diffStat,
    externalId: overrides.externalId,
    lastTimestamp: overrides.lastTimestamp,
    modelName: overrides.modelName,
    worktreePath: overrides.worktreePath,
    prUrl: overrides.prUrl,
    pullRequestNumber: overrides.pullRequestNumber
  }
}
