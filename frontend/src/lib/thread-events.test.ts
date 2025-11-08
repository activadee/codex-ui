import { beforeEach, describe, expect, it, vi } from "vitest"

const runtimeHandlers = vi.hoisted(() => new Map<string, (payload: unknown) => void>())

vi.mock("../../wailsjs/runtime/runtime", () => {
  const EventsOn = vi.fn((topic: string, handler: (payload: unknown) => void) => {
    runtimeHandlers.set(topic, handler)
    return () => {
      runtimeHandlers.delete(topic)
    }
  })

  const EventsOff = vi.fn((topic: string) => {
    runtimeHandlers.delete(topic)
  })

  return { EventsOn, EventsOff }
})

import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime"
import { EventBus, ThreadEventRouter } from "@/eventing"
import type { StreamEventPayload } from "@/types/app"

describe("ThreadEventRouter", () => {
  beforeEach(() => {
    runtimeHandlers.clear()
    vi.mocked(EventsOn).mockClear()
    vi.mocked(EventsOff).mockClear()
  })

  it("routes stream events to listeners and cleans up after completion", () => {
    const router = new ThreadEventRouter(new EventBus())
    const globalListener = vi.fn()
    const threadListener = vi.fn()

    router.subscribeToStream(undefined, globalListener)
    router.subscribeToStream(42, threadListener)
    router.registerStream({ streamId: "abc123", threadId: 42 })

    const topic = "agent:stream:abc123"
    const handler = runtimeHandlers.get(topic)
    expect(handler).toBeTypeOf("function")

    const payload: StreamEventPayload = {
      type: "turn.started",
      usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 2 }
    }

    handler?.(payload)

    expect(globalListener).toHaveBeenCalledTimes(1)
    expect(threadListener).toHaveBeenCalledTimes(1)
    expect(globalListener).toHaveBeenCalledWith(payload, { threadId: 42, streamId: "abc123" })
    expect(threadListener).toHaveBeenCalledWith(payload, { threadId: 42, streamId: "abc123" })

    handler?.({ type: "stream.complete" })
    expect(runtimeHandlers.has(topic)).toBe(false)
  })

  it("shares diff subscriptions and removes runtime listener when last subscriber leaves", () => {
    const router = new ThreadEventRouter(new EventBus())
    const firstListener = vi.fn()
    const secondListener = vi.fn()

    const unsubscribeFirst = router.subscribeToDiffs(7, firstListener)
    const unsubscribeSecond = router.subscribeToDiffs(7, secondListener)

    expect(vi.mocked(EventsOn)).toHaveBeenCalledTimes(1)
    const topic = "agent:file-change:7"
    const handler = runtimeHandlers.get(topic)
    expect(handler).toBeTypeOf("function")

    handler?.({ threadId: 7, files: [] })

    expect(firstListener).toHaveBeenCalledTimes(1)
    expect(secondListener).toHaveBeenCalledTimes(1)

    unsubscribeFirst()
    expect(runtimeHandlers.has(topic)).toBe(true)

    unsubscribeSecond()
    expect(runtimeHandlers.has(topic)).toBe(false)
  })
})
