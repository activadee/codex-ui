import { DiffSubscriptionManager, type FileDiffEvent } from "./diff-subscriptions"
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
  private streams = new StreamSubscriptionManager()
  private diffs = new DiffSubscriptionManager()
  private terminals = new TerminalSubscriptionManager()

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
