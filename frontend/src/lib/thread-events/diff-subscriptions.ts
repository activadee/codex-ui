import { fileChangeTopic } from "@/lib/threads"
import type { FileDiffStat } from "@/types/app"

import { createSubscription, disposeSubscription, type RuntimeSubscription } from "./subscription-helpers"

export type FileDiffEvent = {
  threadId: number
  files: FileDiffStat[]
}

type DiffListener = (event: FileDiffEvent) => void

export class DiffSubscriptionManager {
  private listeners = new Map<number, Set<DiffListener>>()
  private subscriptions = new Map<number, RuntimeSubscription>()

  subscribe(threadId: number | undefined, listener: DiffListener) {
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
    const topic = fileChangeTopic(threadId)
    const subscription = createSubscription(topic, (event: FileDiffEvent) => {
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
          console.error("Thread diff listener failed", error)
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
