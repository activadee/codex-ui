# Eventing Layer

## Files
- `src/eventing/eventBus.ts`
- `src/eventing/stream-subscriptions.ts`
- `src/eventing/diff-subscriptions.ts`
- `src/eventing/terminal-subscriptions.ts`
- `src/eventing/router.ts`
- `src/eventing/context.tsx`

## Responsibilities
- **EventBus** – Priority queue + scheduler for events. Offers `publish`, `subscribe`, `subscribeAll`, diagnostics toggling, and wildcard listeners.
- **Subscription managers** – Wrap Wails runtime topics for streams/diffs/terminal events. They register runtime listeners via `subscription-helpers.ts`, map runtime payloads into typed envelopes, and forward them to registered feature listeners.
- **Context provider** – `ThreadEventRouterProvider` creates the EventBus + ThreadEventRouter and makes them available via React context (`useThreadEventRouter`, `useEventBus`). Diagnostics flags are driven by env (`VITE_EVENTBUS_DIAGNOSTICS`).

## Integration
- Feature hooks (`useAgentStream`, `useThreadFileDiffs`, `useThreadTerminal`) subscribe via the router and update their slices when events arrive.
- EventBus publishes high-level events so future tooling (timeline recorders, inspectors) can listen without modifying feature hooks.

## Notes
- Even though features consume the router, the core bus remains centralized to keep diagnostics + runtime helper code in one place (as discussed in plan.md).
