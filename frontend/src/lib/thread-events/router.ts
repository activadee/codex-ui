import { EventsOff, EventsOn } from "../../../wailsjs/runtime/runtime"
import { fileChangeTopic, streamTopic, terminalTopic } from "@/lib/threads"
import type { FileDiffStat, StreamEventPayload } from "@/types/app"

export type StreamEventContext = {
  threadId: number
  streamId: string
}

export type StreamEventListener = (event: StreamEventPayload, context: StreamEventContext) => void

export type StreamHandleLike = {
  streamId?: string
  threadId: number
}

export type FileDiffEvent = {
  threadId: number
  files: FileDiffStat[]
}

export type TerminalEvent = {
  threadId: number
  type: "ready" | "output" | "exit"
  data?: string
  status?: string
}

type RuntimeSubscription = {
  topic: string
  remove?: () => void
}

function makeSubscription(topic: string, handler: (payload: any) => void): RuntimeSubscription {
  const result = EventsOn(topic, handler)
  const remove = typeof result === "function" ? result : undefined
  return { topic, remove }
}

function cleanupSubscription(subscription: RuntimeSubscription | undefined) {
  if (!subscription) {
    return
  }
  if (subscription.remove) {
    try {
      subscription.remove()
      return
    } catch {
      // ignore and fall through to EventsOff
    }
  }
  EventsOff(subscription.topic)
}

export class ThreadEventRouter {
  private streamListeners = new Map<number, Set<StreamEventListener>>()
  private globalStreamListeners = new Set<StreamEventListener>()
  private streamSubscriptions = new Map<string, RuntimeSubscription>()
  private streamThreadMap = new Map<string, number>()

  private diffListeners = new Map<number, Set<(event: FileDiffEvent) => void>>()
  private diffSubscriptions = new Map<number, RuntimeSubscription>()

  private terminalListeners = new Map<number, Set<(event: TerminalEvent) => void>>()
  private terminalSubscriptions = new Map<number, RuntimeSubscription>()

  registerStream(handle: StreamHandleLike) {
    if (!handle.streamId || handle.streamId.trim() === "") {
      return
    }
    const streamId = handle.streamId
    if (handle.threadId > 0) {
      this.streamThreadMap.set(streamId, handle.threadId)
    }
    if (this.streamSubscriptions.has(streamId)) {
      return
    }
    const topic = streamTopic(streamId)
    const subscription = makeSubscription(topic, (event: StreamEventPayload) => {
      this.handleStreamEvent(streamId, event)
    })
    this.streamSubscriptions.set(streamId, subscription)
  }

  unregisterStream(streamId?: string) {
    if (!streamId) {
      return
    }
    const subscription = this.streamSubscriptions.get(streamId)
    if (subscription) {
      cleanupSubscription(subscription)
      this.streamSubscriptions.delete(streamId)
    }
    this.streamThreadMap.delete(streamId)
  }

  subscribeToStream(threadId: number | undefined, listener: StreamEventListener) {
    if (typeof listener !== "function") {
      return () => undefined
    }
    if (!threadId || threadId <= 0) {
      this.globalStreamListeners.add(listener)
      return () => {
        this.globalStreamListeners.delete(listener)
      }
    }
    let listeners = this.streamListeners.get(threadId)
    if (!listeners) {
      listeners = new Set()
      this.streamListeners.set(threadId, listeners)
    }
    listeners.add(listener)
    return () => {
      const existing = this.streamListeners.get(threadId)
      if (!existing) {
        return
      }
      existing.delete(listener)
      if (existing.size === 0) {
        this.streamListeners.delete(threadId)
      }
    }
  }

  subscribeToDiffs(threadId: number | undefined, listener: (event: FileDiffEvent) => void) {
    if (!threadId || threadId <= 0 || typeof listener !== "function") {
      return () => undefined
    }
    let listeners = this.diffListeners.get(threadId)
    if (!listeners) {
      listeners = new Set()
      this.diffListeners.set(threadId, listeners)
      this.ensureDiffSubscription(threadId)
    }
    listeners.add(listener)
    return () => {
      const current = this.diffListeners.get(threadId)
      if (!current) {
        return
      }
      current.delete(listener)
      if (current.size === 0) {
        this.diffListeners.delete(threadId)
        this.teardownDiffSubscription(threadId)
      }
    }
  }

  subscribeToTerminal(threadId: number | undefined, listener: (event: TerminalEvent) => void) {
    if (!threadId || threadId <= 0 || typeof listener !== "function") {
      return () => undefined
    }
    let listeners = this.terminalListeners.get(threadId)
    if (!listeners) {
      listeners = new Set()
      this.terminalListeners.set(threadId, listeners)
      this.ensureTerminalSubscription(threadId)
    }
    listeners.add(listener)
    return () => {
      const current = this.terminalListeners.get(threadId)
      if (!current) {
        return
      }
      current.delete(listener)
      if (current.size === 0) {
        this.terminalListeners.delete(threadId)
        this.teardownTerminalSubscription(threadId)
      }
    }
  }

  dispose() {
    this.streamSubscriptions.forEach((subscription) => cleanupSubscription(subscription))
    this.streamSubscriptions.clear()
    this.streamThreadMap.clear()
    this.streamListeners.clear()
    this.globalStreamListeners.clear()

    this.diffSubscriptions.forEach((subscription) => cleanupSubscription(subscription))
    this.diffSubscriptions.clear()
    this.diffListeners.clear()

    this.terminalSubscriptions.forEach((subscription) => cleanupSubscription(subscription))
    this.terminalSubscriptions.clear()
    this.terminalListeners.clear()
  }

  private handleStreamEvent(streamId: string, event: StreamEventPayload) {
    const threadId = this.resolveStreamThread(streamId, event.threadId)
    if (!threadId) {
      return
    }

    const context: StreamEventContext = { threadId, streamId }

    const threadListeners = this.streamListeners.get(threadId)
    if (threadListeners) {
      threadListeners.forEach((listener) => {
        try {
          listener(event, context)
        } catch (error) {
          console.error("Thread stream listener failed", error)
        }
      })
    }

    this.globalStreamListeners.forEach((listener) => {
      try {
        listener(event, context)
      } catch (error) {
        console.error("Global stream listener failed", error)
      }
    })

    if (event.type === "stream.complete" || event.type === "stream.error") {
      this.unregisterStream(streamId)
    }
  }

  private ensureDiffSubscription(threadId: number) {
    if (this.diffSubscriptions.has(threadId)) {
      return
    }
    const topic = fileChangeTopic(threadId)
    const subscription = makeSubscription(topic, (event: FileDiffEvent) => {
      if (!event || event.threadId !== threadId) {
        return
      }
      const listeners = this.diffListeners.get(threadId)
      if (!listeners) {
        return
      }
      listeners.forEach((listener) => {
        try {
          listener(event)
        } catch (error) {
          console.error("Thread diff listener failed", error)
        }
      })
    })
    this.diffSubscriptions.set(threadId, subscription)
  }

  private teardownDiffSubscription(threadId: number) {
    const subscription = this.diffSubscriptions.get(threadId)
    if (!subscription) {
      return
    }
    cleanupSubscription(subscription)
    this.diffSubscriptions.delete(threadId)
  }

  private ensureTerminalSubscription(threadId: number) {
    if (this.terminalSubscriptions.has(threadId)) {
      return
    }
    const topic = terminalTopic(threadId)
    const subscription = makeSubscription(topic, (event: TerminalEvent) => {
      if (!event || event.threadId !== threadId) {
        return
      }
      const listeners = this.terminalListeners.get(threadId)
      if (!listeners) {
        return
      }
      listeners.forEach((listener) => {
        try {
          listener(event)
        } catch (error) {
          console.error("Thread terminal listener failed", error)
        }
      })
    })
    this.terminalSubscriptions.set(threadId, subscription)
  }

  private teardownTerminalSubscription(threadId: number) {
    const subscription = this.terminalSubscriptions.get(threadId)
    if (!subscription) {
      return
    }
    cleanupSubscription(subscription)
    this.terminalSubscriptions.delete(threadId)
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
