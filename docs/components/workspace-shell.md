# WorkspaceShell Component

## Location
`src/components/app/workspace-shell.tsx`

## Purpose
Provides the primary layout chrome for the desktop workspace: sidebar, content area, composer slot, and global alerts. All workspace routes render within this shell.

## Key Props
- `sidebar`: React node for the project/thread sidebar (usually from `useWorkspaceSidebar`).
- `conversation`: Node rendered in the main content area (ThreadRoute/ProjectLanding/NewThreadRoute).
- `composer`: Node rendered at the bottom (prompt input + buttons).
- `alerts`: Optional node for global notices (workspace-alerts).

## Notes
- Uses CSS grid/flex to keep sidebar width fixed and the main area scrollable.
- Does not own state; expects workspace controllers to pass already-prepared props/nodes.
