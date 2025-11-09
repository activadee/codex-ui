# Projects Feature

## Purpose
Handles the project catalog exposed by the Wails backend: listing workspaces, registering/deleting entries, and tracking the active project that scopes every other feature (threads, streams, conversations).

## Structure
- **State**: `features/projects/state/projectsSlice.ts` owns the Zustand slice. It stores `projects`, `activeProjectId`, loading/error flags, and exposes actions (`loadProjects`, `registerProject`, `deleteProject`, `selectProjectById`).
- **Hooks**: `features/projects/hooks/useProjects.ts` is a selector-based hook that powers UI/feature controllers. It hydrates on mount, provides derived data (`activeProject`, loading state), and forwards slice actions to the UI layer.
- **Bridge Integration**: The slice calls `platformBridge.projects.*` for all side effects so retries/diagnostics are centralized. Optimistic updates live in the slice so components remain declarative.
- **Tests**: `features/projects/state/projectsSlice.test.ts` validates optimistic flows (register/delete) with mocked bridges using the generated `projects.ProjectDTO` helpers.

## Data Flow & Dependencies
1. UI (e.g., Workspace sidebar) calls `useProjects()` to read state/selectors.
2. The hook invokes slice actions which in turn call the bridge.
3. Responses are mapped to the UI-friendly `Project` type via `features/projects/state/projectsSlice.ts` before being stored.
4. Downstream features (threads, streams) simply read `activeProjectId` from the store; no feature directly talks to the bridge.

## Notes
- Project registration errors stay inside the slice as `projectsError`, so controllers only show messages; no imperative error plumbing is necessary.
- The hook intentionally keeps React Query’s `select` pattern by exposing `loadProjects` for manual refresh, easing the migration away from React Query described in `docs/frontend-architecture.md`.
