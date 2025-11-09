# Workspace Feature

## Purpose
Coordinates all other features (projects, threads, conversation, streams, terminal, diffs) into the desktop workspace experience: routing, sidebar, composer, dialogs, controllers, and stream lifecycle management.

## Structure
- **Hooks**: `features/workspace/hooks` contains `useWorkspaceController` (the main façade), `useConversationManager`, `useStreamLifecycle`, and `useThreadSelection`. These compose domain hooks/slices into UI-facing models.
- **Controllers**: `features/workspace/controllers` hosts focused hooks (`useMessageSender`, `useThreadActions`, `usePendingAttachments`, `useStreamErrors`) that encapsulate imperative logic.
- **Routing & UI Helpers**: `features/workspace/routing/useWorkspaceRouting.ts` keeps the URL in sync with store state; `features/workspace/ui/*` provides composer/sidebar/dialog helpers built on top of the controller state.
- **Entry Points**: `routes/WorkspaceLayout.tsx` + `routes/workspace-context.ts` import everything exclusively through the feature barrels, keeping the route layer thin.

## Data Flow
1. `useWorkspaceController` pulls selectors from project/thread/conversation/stream slices and exposes structured objects (`workspace.projects`, `workspace.threads`, etc.).
2. Workspace routing uses this controller to drive navigation and to reset composer state on thread changes.
3. UI components (sidebar, composer, thread routes) consume either the controller or the context, never touching slices or bridges directly.

## Notes
- Because controllers live alongside the feature, testing/mocking becomes easier: each controller exports plain hooks that can be swapped during tests.
- Future workspace sub-features (e.g., workbench, notifications) can slot into this structure by adding new controllers/ui modules without breaking the routing or store boundaries.
