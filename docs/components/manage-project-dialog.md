# ManageProjectDialog Component

## Location
`src/components/app/manage-project-dialog.tsx`

## Purpose
Handles UI for registering a new project workspace from the desktop app. Presents a modal dialog with project path/name inputs.

## Behavior
- Consumes props provided by `useWorkspaceDialogs` (open/close state, error, submitting flag, directory picker callback).
- Calls the passed `onSubmit` to trigger `workspace.projects.register`.
- Shows inline validation/error messages when registration fails.

## Notes
- The actual dialog state (open, error message) lives in the workspace feature hook so the component stays presentational.
