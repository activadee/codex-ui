import { EventsOff, EventsOn } from "../../../wailsjs/runtime/runtime"

export type RuntimeSubscription = {
  topic: string
  remove?: () => void
}

export function createSubscription<TPayload>(
  topic: string,
  handler: (payload: TPayload) => void
): RuntimeSubscription {
  const result = EventsOn(topic, handler)
  const remove = typeof result === "function" ? result : undefined
  return { topic, remove }
}

export function disposeSubscription(subscription: RuntimeSubscription | undefined) {
  if (!subscription) {
    return
  }
  if (subscription.remove) {
    try {
      subscription.remove()
      return
    } catch {
      // fall back to EventsOff when the returned callback fails
    }
  }
  EventsOff(subscription.topic)
}
