# Streams Feature

## Purpose
Manages the lifecycle of agent streams (start/cancel, per-thread state, event handling) and acts as the bridge between Wails agent bindings, the EventBus, and workspace controllers.

## Structure
- **State**: `features/streams/state/streamsSlice.ts` stores `threadStreams` keyed by thread ID with `status`, `usage`, `error`, `streamId`. It exposes `setThreadStreamState` and `resetThreadStream` for controllers/hooks.
- **Hook**: `features/streams/hooks/useAgentStream.ts` is the primary interface. It:
  - Guards against concurrent streams per thread.
  - Calls `platformBridge.threads.sendMessage` / `.cancelStream` for side effects.
  - Subscribes to stream events via `useThreadEventRouter` and publishes diagnostics on the EventBus.
  - Updates the slice so any component can read current stream state.
- **Workspace Integration**: `useStreamLifecycle` (workspace hook) composes `useAgentStream` with conversation/thre ad controllers to handle optimistic entries, attachments, and preview syncing.

## Notes
- The hook emits lifecycle events (start/cancel/error) to the EventBus so future tooling (record/replay) can observe them without touching the hook implementation.
- Slice-backed state enables components like status bars or stream indicators to read stream info without prop drilling.
