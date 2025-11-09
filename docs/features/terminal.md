# Terminal Feature

## Purpose
Manages per-thread terminal sessions spawned by the agent workspace (start/stop/resize/write) and exposes status/error information to terminal UI components.

## Structure
- **State**: `features/terminal/state/terminalSlice.ts` tracks session status (`idle`, `connecting`, `ready`, etc.), errors, and exit codes per thread. Actions: `setTerminalSession` and `resetTerminalSession`.
- **Hook**: `features/terminal/hooks/useThreadTerminal.ts` wraps the slice and:
  - Invokes `platformBridge.terminal.*` for side effects.
  - Subscribes to terminal events through the EventBus (`useThreadEventRouter`).
  - Broadcasts listener events so components (e.g., terminal widget) can render streaming output.
- **Cleanup**: On unmount or thread switch, the hook resets the slice state and ensures the backend session is stopped.

## Notes
- By storing terminal state in the slice, the UI can reflect status (connecting, ready, exited) without prop drilling or duplicate local state.
- The hook exposes `subscribe` so multiple components (e.g., transcript viewer + metrics) can listen to output concurrently.
