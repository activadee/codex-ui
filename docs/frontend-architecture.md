# Frontend Architecture Decision Record

## Context
- Desktop app uses Wails; backend exposes Go bindings via `wailsjs` without REST.
- Existing frontend relies on React Query and ad-hoc hooks, making concurrency and state cohesion difficult.
- Product requirements emphasize simultaneous stream events, extensibility, and tooling alignment with Zustand.

## Decision
Adopt a layered architecture anchored by a Wails platform bridge, an event-driven domain layer, and a centralized Zustand store. Replace TanStack React Query usage with domain-aware slices and selectors, and upgrade the existing thread-event tooling into a full event bus with deterministic scheduling.

## Architecture Overview
1. **Platform Layer (`frontend/src/platform`)**
   - `wailsBridge.ts`: typed wrappers around Go commands (projects, agents, attachments) with retry/backoff and error normalization.
   - `eventChannels.ts`: strongly typed topic definitions for stream, diff, terminal, notification events plus helpers for enqueue/dequeue metadata.
   - `runtimeServices.ts`: cross-cutting utilities (logging, feature flags, persisted config) injected downstream.

2. **Domain Layer (`frontend/src/domain`)**
   - Bounded contexts (`projects`, `threads`, `conversation`, `streams`, `workbench`) encapsulate business logic, DTO mapping, and validation.
   - Domain modules consume the platform bridge only through explicit contracts, emitting typed domain events.

3. **State Layer (`frontend/src/state`)**
   - Zustand store factory composes slices for projects, threads, conversations, streams, and UI controls.
   - Middleware stack: `immer` (immutable ergonomics), `subscribeWithSelector` (fine-grained reactions), optional `persist` with custom storage adapter.
   - Slices expose selectors + action creators; hooks become thin view-model adapters.

4. **Eventing Layer (`frontend/src/eventing`)**
   - Event bus built on priority queues + scheduler coordinates backend pushes, UI intents, background tasks.
   - Existing `ThreadEventRouter` components act as adapters publishing envelopes to the bus; diagnostics allow replay.

5. **UI Layer (`frontend/src/ui`, `frontend/src/routes`, `frontend/src/components`)**
   - UI consumes selectors, dispatches actions, and remains presentation-focused.
   - Feature hooks (workspace controller, composer, terminal) orchestrate by reading from the store instead of chaining React Query hooks.

## State & Event Handling Highlights
- **Projects Slice** manages catalog, active project, optimistic register/delete, and error surface.
- **Threads Slice** normalizes thread entities, derives sections, and tracks active selection.
- **Conversation Slice** stores timelines, ensures per-thread buffers, and syncs previews.
- **Streams Slice** stores per-thread stream state, usage, errors, attachments metadata, and interacts with EventBus for concurrency.
- Event bus handles backend event prioritization, deduplication, batching, and worker offloading for diff/stat calculations.

## Implications
- Removing React Query simplifies hydration but requires thorough testing of custom cache behavior.
- Centralized store + event bus improves testability and replay but necessitates new dev tooling (store devtools, event timeline recorder).
- Clear seams (bridge/domain/state) make Wails upgrades or backend protocol changes low-risk.

## References
- Plan tasks in `plan.md` (each references this ADR).
- Legacy hook implementations (e.g., `frontend/src/hooks/useProjects.ts`, `frontend/src/hooks/useAgentThreads.ts`) serve as migration inputs.
