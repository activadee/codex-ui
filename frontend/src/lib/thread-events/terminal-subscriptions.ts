import { terminalTopic } from "@/lib/threads"

import { createSubscription, disposeSubscription, type RuntimeSubscription } from "./subscription-helpers"

export type TerminalEvent = {
  threadId: number
  type: "ready" | "output" | "exit"
  data?: string
  status?: string
}

type TerminalListener = (event: TerminalEvent) => void

export class TerminalSubscriptionManager {
  private listeners = new Map<number, Set<TerminalListener>>()
  private subscriptions = new Map<number, RuntimeSubscription>()

  subscribe(threadId: number | undefined, listener: TerminalListener) {
    if (!threadId || threadId <= 0 || typeof listener !== "function") {
      return () => undefined
    }
    let listeners = this.listeners.get(threadId)
    if (!listeners) {
      listeners = new Set()
      this.listeners.set(threadId, listeners)
      this.ensureSubscription(threadId)
    }
    listeners.add(listener)
    return () => {
      const current = this.listeners.get(threadId)
      if (!current) {
        return
      }
      current.delete(listener)
      if (current.size === 0) {
        this.listeners.delete(threadId)
        this.teardownSubscription(threadId)
      }
    }
  }

  dispose() {
    this.subscriptions.forEach((subscription) => disposeSubscription(subscription))
    this.subscriptions.clear()
    this.listeners.clear()
  }

  private ensureSubscription(threadId: number) {
    if (this.subscriptions.has(threadId)) {
      return
    }
    const topic = terminalTopic(threadId)
    const subscription = createSubscription(topic, (event: TerminalEvent) => {
      if (!event || event.threadId !== threadId) {
        return
      }
      const listeners = this.listeners.get(threadId)
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
    this.subscriptions.set(threadId, subscription)
  }

  private teardownSubscription(threadId: number) {
    const subscription = this.subscriptions.get(threadId)
    if (!subscription) {
      return
    }
    disposeSubscription(subscription)
    this.subscriptions.delete(threadId)
  }
}
