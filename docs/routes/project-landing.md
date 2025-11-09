# ProjectLanding Route

## Path
`/projects/:projectId`

## Purpose
Shown when a project is selected but no thread is active. It greets the user, surfaces project metadata, and encourages creating/selecting a thread.

## Implementation Notes
- Consumes `useWorkspaceRouteContext()` to access `workspace.projects` for project details and composer helpers for CTA buttons.
- Displays recent activity via `workspace.threads.sections` when available.
- Provides entry points to register new projects or spawn a new thread (calls `workspace.projects.register` / `workspace.threads.newThread`).

## Dependencies
- Workspace context (no direct store or bridge calls).
- `WorkspaceShell` layout for consistent styling.
