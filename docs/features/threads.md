# Threads Feature

## Purpose
Represents agent threads per project, handles selection, optimistic updates (rename/delete), and maps backend DTOs into UI-ready entities with derived metadata (preview text, sections, timestamps).

## Structure
- **Domain**: `domain/threads` contains DTO mappers plus helpers like `threadToListItem`, `formatThreadSections`, and `updateThreadPreview`. Every slice/controller relies on these pure functions.
- **State**: `features/threads/state/threadsSlice.ts` stores normalized thread arrays keyed by project, active thread IDs, loading/error flags, and thread→project maps. It exposes actions (`loadThreads`, `refreshThread`, `renameThread`, `deleteThread`, `createPullRequest`, etc.).
- **Hooks**: `features/threads/hooks/useAgentThreads.ts` wraps the slice selectors, triggers hydration when the active project changes, and computes sections via the domain helpers.
- **Workspace Controllers**: `features/workspace/controllers/useThreadActions.ts` and `useWorkspaceController.ts` consume the slice through the hook to drive UI interactions (select, rename, delete, new thread routes).
- **Tests**: `features/threads/state/threadsSlice.test.ts` uses generated DTOs to assert optimistic updates, refresh flows, and error handling.

## Data Flow
1. `useProjects()` sets the active project → `useAgentThreads(projectId)` triggers `loadThreads` when it sees an unhydrated project.
2. Slice actions call `platformBridge.threads.*` and reconcile responses into normalized state.
3. Domain helpers keep derived views (sections, previews) in sync without duplicating logic across components.
4. Workspace routing listens to `workspace.threads` selectors to keep the URL and UI selection aligned.

## Notes
- Thread deletion clears associated conversation/diff state via callbacks stored on the slice; this keeps dependent features consistent without extra wiring in controllers.
- Optimistic rename retains the previous preview/last-timestamp values until the next backend refresh, ensuring UI stability during concurrent events.
