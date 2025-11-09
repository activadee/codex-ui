# ThreadRoute

## Path
`/projects/:projectId/threads/:threadId`

## Purpose
Renders the active thread conversation/stream UI. It consumes workspace context and composer helpers to show the timeline, stream status, and composer.

## Behavior
1. Reads `workspace` from context to access `threads.active`, `conversation.list`, `stream` state.
2. Ensures `workspace.threads.select()` is called via routing hook, so state + URL stay synced.
3. Displays system/user/agent entries with components bound to conversation slice selectors.
4. Surfaces stream errors/status from `workspace.stream` and composer state to the UI.

## Notes
- ThreadRoute never fetches data directly; all queries go through the workspace controller/slices.
- New thread creation is handled by `NewThreadRoute`; once a thread is active, ThreadRoute becomes responsible for the view.
