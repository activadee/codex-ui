# Diffs Feature

## Purpose
Provides normalized per-thread file diff stats, listening to backend diff events and exposing selectors for UI components like the Files panel.

## Structure
- **State**: `features/diffs/state/diffSlice.ts` keeps `diffsByThreadId`, loading/error flags, and exposes `loadDiffs` (bridge call) plus `setDiffsFromEvent` for runtime updates.
- **Hook**: `features/diffs/hooks/useThreadFileDiffs.ts` reads slice selectors, auto-loads diffs when a thread is active, subscribes to diff events via `useThreadEventRouter`, and exposes `refresh()` for manual reloads.
- **UI**: `components/app/files-panel.tsx` consumes the hook to render file stats and orchestrates PR actions through the threads slice.
- **Tests**: `features/diffs/state/diffSlice.test.ts` ensures load/error/event flows behave deterministically.

## Notes
- Diff events originate from the EventBus bridge (`eventChannels.threadDiffChannel`), so the hook never touches Wails runtime APIs directly.
- The slice’s `setDiffsFromEvent` is also called when threads are deleted (to clear state) ensuring stale diffs never linger in the UI.
