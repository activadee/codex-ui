# NewThreadRoute

## Path
`/projects/:projectId/threads/new`

## Purpose
Entry point for creating a fresh thread. When navigated to, it:
- Clears the composer (via routing hook) so the user can enter a new prompt.
- Instructs the workspace controller to reset `workspace.threads.active`.
- Presents guidance on starting a new conversation (UI copy lives in the component).

## Implementation
Relies entirely on `useWorkspaceRouteContext()` to:
- call `workspace.threads.newThread()` (which clears state and sets `activeThread` to `null`).
- use composer helpers to show attachments/prompt inputs.

Once the user sends the first prompt, the workspace stream controller creates a thread via `useMessageSender`, which triggers routing to the new thread ID.
