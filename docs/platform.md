# Platform Layer

## Files
- `src/platform/wailsBridge.ts`
- `src/platform/runtimeServices.ts`
- `src/platform/runtimeClient.ts`
- `src/platform/eventChannels.ts`

## Responsibilities
1. **Bridge (wailsBridge.ts)** – wraps all Go bindings with typed contracts, retry/backoff, and diagnostics. Exposes grouped bridges for projects, threads, attachments, terminal, and UI helpers.
2. **Runtime services (runtimeServices.ts)** – centralizes logging, diagnostics, feature flags, clock, and `openExternal`. `runtimeClient.ts` exports a singleton so the entire frontend shares the same services instance.
3. **Event channels (eventChannels.ts)** – defines topic helpers for streams, diffs, terminal events with metadata (priority, descriptions). Used by the EventBus to subscribe/publish to Wails runtime events.

## Usage Pattern
- Features/slices never import `wailsjs/...` directly; they call `platformBridge.*` so retries + diagnostics are automatic.
- UI helpers (e.g., FilesPanel) use `runtimeServices.openExternal` instead of hitting the runtime themselves.
- Eventing managers use the channel helpers to derive topic strings, keeping naming consistent with the backend.
