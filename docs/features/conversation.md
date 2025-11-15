# Conversation Feature

## Purpose
Normalizes and stores agent/user/system conversation entries per thread, enabling timeline hydration, optimistic inserts during streaming, and preview synchronization with threads.

## Structure
- **Domain**: `domain/conversation/index.ts` exports `normaliseConversation`, cloning agent/user/system DTO payloads into immutable entries with consistent IDs, and `sortConversationEntries`, which chronologically orders entries (created/updated timestamp fallback, then ID) so timelines remain deterministic.
- **State**: `features/conversation/state/conversationSlice.ts` keeps `conversationByThreadId`, loading/error flags, and exposes actions (`loadConversation`, `ensureConversation`, `updateConversationEntries`, `clearConversation`). It interacts with `platformBridge.threads.loadConversation` for hydration and always pipes results through the domain sorter (both on load and update) to keep per-thread arrays chronological.
- **Hooks**: `features/conversation/hooks/useThreadConversation.ts` is a thin selector-based hook that auto-loads the timeline when a thread becomes active and provides `setConversation` + `refetch` helpers for controllers.
- **Workspace Controllers**: `useConversationManager` (in `features/workspace/hooks`) orchestrates higher-level behaviors: appending user entries, upserting agent entries during streams, syncing previews, and deriving thread sections.
- **Tests**: `features/conversation/state/conversationSlice.test.ts` covers load/ensure/update flows with mocked bridge responses, including the chronology guarantees enforced by the sorter.

## Data Flow
1. Workspace controller calls `useThreadConversation(threadId)` to get entries + helpers.
2. When streams emit events, `useStreamLifecycle` delegates to `useConversationManager` which relies on `conversationSlice` actions to append/merge entries.
3. `threadsSlice` listens for `clearConversation` during thread deletion to keep slices consistent.

## Notes
- The slice intentionally keeps raw `ConversationEntry` objects so upstream components (timeline, preview chips, diff inspectors) can share the same data without adaptation layers.
- By exposing `ensureConversation`, controllers (e.g., `useStreamLifecycle`) can guarantee a timeline exists before pushing optimistic entries, avoiding null checks throughout the UI.
- Sorting happens in the domain layer with defensive timestamp parsing, so even when optimistic entries emit out of order (or without `updatedAt`), state/selectors always see deterministic chronological arrays.
