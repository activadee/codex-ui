import { streamTopic } from "@/lib/threads"
import type { StreamEventPayload } from "@/types/app"

import { createSubscription, disposeSubscription, type RuntimeSubscription } from "./subscription-helpers"

export type StreamEventContext = {
  threadId: number
  streamId: string
}

export type StreamEventListener = (event: StreamEventPayload, context: StreamEventContext) => void

export type StreamHandleLike = {
  streamId?: string
  threadId: number
}

export class StreamSubscriptionManager {
  private listeners = new Map<number, Set<StreamEventListener>>()
  private globalListeners = new Set<StreamEventListener>()
  private subscriptions = new Map<string, RuntimeSubscription>()
  private streamThreadMap = new Map<string, number>()

  register(handle: StreamHandleLike) {
    if (!handle.streamId || handle.streamId.trim() === "") {
      return
    }
    const streamId = handle.streamId
    if (handle.threadId > 0) {
      this.streamThreadMap.set(streamId, handle.threadId)
    }
    if (this.subscriptions.has(streamId)) {
      return
    }
    const topic = streamTopic(streamId)
    const subscription = createSubscription(topic, (event: StreamEventPayload) => {
      this.handleStreamEvent(streamId, event)
    })
    this.subscriptions.set(streamId, subscription)
  }

  unregister(streamId?: string) {
    if (!streamId) {
      return
    }
    const subscription = this.subscriptions.get(streamId)
    if (subscription) {
      disposeSubscription(subscription)
      this.subscriptions.delete(streamId)
    }
    this.streamThreadMap.delete(streamId)
  }

  subscribe(threadId: number | undefined, listener: StreamEventListener) {
    if (typeof listener !== "function") {
      return () => undefined
    }
    if (!threadId || threadId <= 0) {
      this.globalListeners.add(listener)
      return () => {
        this.globalListeners.delete(listener)
      }
    }
    let listeners = this.listeners.get(threadId)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(threadId, listeners)
    }
    listeners.add(listener)
    return () => {
      const existing = this.listeners.get(threadId)
      if (!existing) {
        return
      }
      existing.delete(listener)
      if (existing.size === 0) {
        this.listeners.delete(threadId)
      }
    }
  }

  dispose() {
    this.subscriptions.forEach((subscription) => disposeSubscription(subscription))
    this.subscriptions.clear()
    this.streamThreadMap.clear()
    this.listeners.clear()
    this.globalListeners.clear()
  }

  private handleStreamEvent(streamId: string, event: StreamEventPayload) {
    const threadId = this.resolveStreamThread(streamId, event.threadId)
    if (!threadId) {
      return
    }

    const context: StreamEventContext = { threadId, streamId }

    const threadListeners = this.listeners.get(threadId)
    if (threadListeners) {
      threadListeners.forEach((listener) => {
        try {
          listener(event, context)
        } catch (error) {
          console.error("Thread stream listener failed", error)
        }
      })
    }

    this.globalListeners.forEach((listener) => {
      try {
        listener(event, context)
      } catch (error) {
        console.error("Global stream listener failed", error)
      }
    })

    if (event.type === "stream.complete" || event.type === "stream.error") {
      this.unregister(streamId)
    }
  }

  private resolveStreamThread(streamId: string, payloadThreadId?: string) {
    const known = this.streamThreadMap.get(streamId)
    if (known && known > 0) {
      return known
    }
    if (!payloadThreadId) {
      return null
    }
    const parsed = Number.parseInt(payloadThreadId, 10)
    if (Number.isNaN(parsed) || parsed <= 0) {
      return null
    }
    this.streamThreadMap.set(streamId, parsed)
    return parsed
  }
}
