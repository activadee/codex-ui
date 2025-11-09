# Workspace Route Context

`src/routes/workspace-context.ts` exposes React helpers for nested routes:

- **`WorkspaceRouteContextValue`** describes the shape provided by `WorkspaceLayout` (workspace controller, composer state, attachment helpers).
- **`useWorkspaceRouteContext()`** wraps `useOutletContext` so child routes can safely access the context with type inference.

## Why it exists
Nested routes such as `ThreadRoute` and `NewThreadRoute` need access to the same workspace/controller data without prop drilling. Using React Router's outlet context keeps the route tree declarative while guaranteeing the data stays consistent with the layout provider.
