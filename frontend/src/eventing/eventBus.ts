import type { EventPriority } from "@/platform/eventChannels"
import type { DiagnosticsClient } from "@/platform/runtimeServices"

export type EventEnvelope<TPayload = unknown> = {
  topic: string
  payload: TPayload
  priority: EventPriority
  source?: string
  timestamp: number
}

export type EventListener<TPayload = unknown> = (
  payload: TPayload,
  envelope: EventEnvelope<TPayload>
) => void

export type EventBusOptions = {
  diagnostics?: DiagnosticsClient
  diagnosticsEnabled?: boolean
}

const priorityWeight: Record<EventPriority, number> = {
  critical: 0,
  high: 1,
  default: 2,
  low: 3
}

export class EventBus {
  private listeners = new Map<string, Set<EventListener<any>>>()
  private anyListeners = new Set<EventListener<any>>()
  private queue: EventEnvelope[] = []
  private flushing = false
  private diagnostics?: DiagnosticsClient
  private diagnosticsEnabled: boolean

  constructor(options: EventBusOptions = {}) {
    this.diagnostics = options.diagnostics
    this.diagnosticsEnabled = options.diagnosticsEnabled ?? false
  }

  publish<TPayload>(
    topic: string,
    payload: TPayload,
    priority: EventPriority = "default",
    source?: string
  ) {
    const envelope: EventEnvelope<TPayload> = {
      topic,
      payload,
      priority,
      source,
      timestamp: Date.now()
    }
    this.queue.push(envelope)
    this.scheduleFlush()
  }

  subscribe<TPayload>(topic: string, listener: EventListener<TPayload>) {
    if (typeof listener !== "function") {
      return () => undefined
    }
    let listeners = this.listeners.get(topic)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(topic, listeners)
    }
    listeners.add(listener as EventListener<any>)
    return () => {
      const current = this.listeners.get(topic)
      if (!current) {
        return
      }
      current.delete(listener as EventListener<any>)
      if (current.size === 0) {
        this.listeners.delete(topic)
      }
    }
  }

  subscribeAll(listener: EventListener) {
    if (typeof listener !== "function") {
      return () => undefined
    }
    this.anyListeners.add(listener)
    return () => {
      this.anyListeners.delete(listener)
    }
  }

  toggleDiagnostics(enabled: boolean) {
    this.diagnosticsEnabled = enabled
  }

  reset() {
    this.listeners.clear()
    this.anyListeners.clear()
    this.queue = []
  }

  private scheduleFlush() {
    if (this.flushing) {
      return
    }
    this.flushing = true
    const flush = () => this.flushQueue()
    if (typeof queueMicrotask === "function") {
      queueMicrotask(flush)
      return
    }
    Promise.resolve().then(flush).catch((error) => {
      console.error("EventBus flush failed", error)
      this.flushing = false
    })
  }

  private flushQueue() {
    try {
      this.queue.sort((a, b) => {
        const priorityDelta = priorityWeight[a.priority] - priorityWeight[b.priority]
        if (priorityDelta !== 0) {
          return priorityDelta
        }
        return a.timestamp - b.timestamp
      })
      while (this.queue.length > 0) {
        const envelope = this.queue.shift()
        if (!envelope) {
          continue
        }
        this.deliver(envelope)
      }
    } finally {
      this.flushing = false
    }
  }

  private deliver(envelope: EventEnvelope) {
    const listeners = this.listeners.get(envelope.topic)
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(envelope.payload, envelope)
        } catch (error) {
          console.error("EventBus listener failed", error)
        }
      })
    }

    if (this.anyListeners.size > 0) {
      this.anyListeners.forEach((listener) => {
        try {
          listener(envelope.payload, envelope)
        } catch (error) {
          console.error("EventBus wildcard listener failed", error)
        }
      })
    }

    if (this.diagnostics && this.diagnosticsEnabled) {
      this.diagnostics.emit({
        type: "eventbus.publish",
        topic: envelope.topic,
        priority: envelope.priority,
        queued: this.queue.length
      })
    }
  }
}
