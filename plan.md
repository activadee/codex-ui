# Frontend Re-architecture Plan

## Goal
Replace the current React Query–centric frontend with the Wails-native, Zustand-driven architecture described in `docs/frontend-architecture.md`, ensuring concurrency-safe event handling and long-term extensibility.

## Tasks (1 commit each)
- [ ] **Bootstrap platform bridge**
  - Create `frontend/src/platform/{wailsBridge,eventChannels,runtimeServices}.ts` with typed wrappers over Go bindings, retry/backoff policies, and shared diagnostics hooks.
  - Write inline usage docs pointing back to `docs/frontend-architecture.md` so downstream layers consume only the new bridge contracts.
  - Reference: `docs/frontend-architecture.md`.
- [ ] **Introduce EventBus shell**
  - Move `frontend/src/lib/thread-events/*` into `frontend/src/eventing`, implement a priority-aware pub/sub API, and add developer diagnostics toggles.
  - Update `useAgentStream` to emit events through the bus while preserving existing UI behavior to de-risk the migration.
  - Reference: `docs/frontend-architecture.md`.
- [ ] **Create Zustand store factory**
  - Add `frontend/src/state/createAppStore.ts` plus `AppStateProvider`/`useAppStore` hooks, wiring middleware (`immer`, `subscribeWithSelector`, optional `persist`).
  - Keep React Query temporarily; just ensure the store can be mounted alongside current providers as outlined in the ADR.
  - Reference: `docs/frontend-architecture.md`.
- [ ] **Implement projects slice**
  - Build `frontend/src/state/slices/projectsSlice.ts` encapsulating project catalog, selection, optimistic register/delete, and error state via bridge commands.
  - Refactor `useProjects.ts` (and any consumers) into selector-based hooks; remove React Query usage for projects and validate via unit tests/mocks.
  - Reference: `docs/frontend-architecture.md`.
- [ ] **Implement threads slice**
  - Extract DTO mappers into `frontend/src/domain/threads` and create `threadsSlice` for loading, refreshing, section derivation, and active selection.
  - Migrate `useAgentThreads`, `useThreadSelection`, and dependent hooks to consume selectors/actions only, ensuring optimistic preview updates still work.
  - Reference: `docs/frontend-architecture.md`.
- [ ] **Implement conversation slice**
  - Port `useConversationManager` responsibilities (timeline hydration, preview sync, system/agent/user entry updates) into `conversationSlice` with well-typed actions.
  - Update conversation-related hooks and components to use the slice and remove direct Query Client access.
  - Reference: `docs/frontend-architecture.md`.
- [ ] **Implement streams slice + agent stream actions**
  - Move stream state from `useAgentStream` into `streamsSlice`, ensuring actions interact with EventBus + bridge and track pending attachments for cleanup.
  - Refactor `useStreamLifecycle`/workspace controller logic to dispatch slice actions and verify multi-event concurrency scenarios via tests or simulated events.
  - Reference: `docs/frontend-architecture.md`.
- [ ] **Remove React Query + finalize wiring**
  - Delete TanStack React Query dependency/usages, wrap the app solely with `AppStateProvider` (plus EventBus provider), and ensure hooks pull data from Zustand slices only.
  - Run lint/build/test pipelines, update documentation, and confirm architecture parity with `docs/frontend-architecture.md` before closing.
  - Reference: `docs/frontend-architecture.md`.

## Architecture Follow-ups (Nov 9, 2025)
- [x] **Enforce bridge-only platform access**
  - Replace remaining direct `wailsjs` imports (attachments, terminal, file diffs, workspace dialogs, message sender) with the typed contracts exposed by `frontend/src/platform/wailsBridge.ts`.
  - Ensure hooks such as `useAgentStream`, `useThreadTerminal`, `useThreadFileDiffs`, `useAttachmentManager`, and workspace controllers pull bridge dependencies via a shared seam so diagnostics + retry policies apply consistently.
- [x] **Move terminal & diff runtime state into the store/event layer**
  - Back terminal/diff subscriptions with Zustand slices that react to EventBus topics instead of per-hook `useState`.
  - Expose selectors/actions for terminal lifecycle, diff listings, and optimistic updates so components stay presentation-only.
- [ ] **Align workspace panels/components with domain/state modules**
  - Route PR creation, thread refresh, and dialog flows through the existing threads/projects slices (or new domain helpers) rather than calling `wailsjs` bindings directly.
  - Update documentation/tests once these seams are in place.

## Unresolved Questions
- none
