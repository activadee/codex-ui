import { DiffSubscriptionManager, type FileDiffEvent } from "./diff-subscriptions"
import { EventBus } from "./eventBus"
import {
  StreamSubscriptionManager,
  type StreamEventListener,
  type StreamHandleLike
} from "./stream-subscriptions"
import { TerminalSubscriptionManager, type TerminalEvent } from "./terminal-subscriptions"

export type { StreamEventContext, StreamEventListener, StreamHandleLike } from "./stream-subscriptions"
export type { FileDiffEvent } from "./diff-subscriptions"
export type { TerminalEvent } from "./terminal-subscriptions"

export class ThreadEventRouter {
  private streams: StreamSubscriptionManager
  private diffs: DiffSubscriptionManager
  private terminals: TerminalSubscriptionManager

  constructor(private readonly bus: EventBus) {
    this.streams = new StreamSubscriptionManager(bus)
    this.diffs = new DiffSubscriptionManager(bus)
    this.terminals = new TerminalSubscriptionManager(bus)
  }

  registerStream(handle: StreamHandleLike) {
    this.streams.register(handle)
  }

  unregisterStream(streamId?: string) {
    this.streams.unregister(streamId)
  }

  subscribeToStream(threadId: number | undefined, listener: StreamEventListener) {
    return this.streams.subscribe(threadId, listener)
  }

  subscribeToDiffs(threadId: number | undefined, listener: (event: FileDiffEvent) => void) {
    return this.diffs.subscribe(threadId, listener)
  }

  subscribeToTerminal(threadId: number | undefined, listener: (event: TerminalEvent) => void) {
    return this.terminals.subscribe(threadId, listener)
  }

  dispose() {
    this.streams.dispose()
    this.diffs.dispose()
    this.terminals.dispose()
  }
}
