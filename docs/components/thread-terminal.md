# ThreadTerminal Component

## Location
`src/components/app/thread-terminal/thread-terminal.tsx`

## Purpose
Wraps the terminal feature hook (`useThreadTerminal`) and renders terminal output/status for the active thread.

## Responsibilities
- Calls `useThreadTerminal(threadId)` to manage session start/stop, write, resize, and subscribe to events.
- Registers a listener to render streaming output via `<pre>` blocks.
- Exposes UI buttons for sending input and clearing output.

## Notes
- All terminal state (status, error, exit code) is sourced from the slice; the component only renders.
- Cleanup automatically stops the backend terminal session via the hook’s effect.
