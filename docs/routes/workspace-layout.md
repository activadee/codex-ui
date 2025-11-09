# WorkspaceLayout Route

## Purpose
Top-level route mounted for `/projects/*`. It wires up the Workspace feature to the UI shell:
- Instantiates `useWorkspaceController` (projects, threads, conversation, streams, etc.).
- Provides composer, dialog, and routing helpers via the workspace context.
- Renders the `WorkspaceShell` with sidebar, composer, and nested routes (`ThreadRoute`, `ProjectLanding`, `NewThreadRoute`).

## Responsibilities
1. **State orchestration** – obtains the `workspace` object (with `projects`, `threads`, `stream`, etc.) and memoizes props for the sidebar/composer.
2. **Routing glue** – uses `useWorkspaceRouting` to keep URL params in sync with selected project/thread and to reset the composer when navigating.
3. **Composer actions** – wires `useComposerState` to the workspace stream controller, handling prompt submission and attachments.
4. **Dialogs** – integrates `useWorkspaceDialogs` for project selection/register flows.
5. **Outlet context** – supplies `WorkspaceRouteContextValue` to nested routes so they can read `workspace` and composer controls without prop drilling.

## Related Files
- `src/routes/workspace-context.ts`
- `src/features/workspace/hooks/useWorkspaceController.ts`
- `src/features/workspace/routing/useWorkspaceRouting.ts`
- `src/features/workspace/ui/*`
