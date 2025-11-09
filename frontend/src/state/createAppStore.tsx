import { createContext, useContext, useRef, type ReactNode } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"
import type { StateCreator } from "zustand"
import { createJSONStorage, persist, subscribeWithSelector } from "zustand/middleware"
import { immer } from "zustand/middleware/immer"

import { platformBridge, type PlatformBridge } from "@/platform/wailsBridge"

import { createProjectsSlice, type ProjectsSlice } from "@/features/projects/state/projectsSlice"
import { createThreadsSlice, type ThreadsSlice } from "@/features/threads/state/threadsSlice"
import { createConversationSlice, type ConversationSlice } from "@/features/conversation/state/conversationSlice"
import { createStreamsSlice, type StreamsSlice } from "@/features/streams/state/streamsSlice"
import { createTerminalSlice, type TerminalSlice } from "@/features/terminal/state/terminalSlice"
import { createDiffSlice, type DiffSlice } from "@/features/diffs/state/diffSlice"

/**
 * Runtime-focused subset of the global app state.
 * Additional slices extend this shape as tasks in {@link docs/frontend-architecture.md} land.
 */
export type RuntimeState = {
  hydrationStatus: AppHydrationStatus
  eventDiagnosticsEnabled: boolean
}

export type AppHydrationStatus = "idle" | "hydrating" | "ready"

export type AppState = RuntimeSlice &
  ProjectsSlice &
  ThreadsSlice &
  ConversationSlice &
  StreamsSlice &
  TerminalSlice &
  DiffSlice

export type RuntimeSlice = {
  runtime: RuntimeState
  setHydrationStatus: (status: AppHydrationStatus) => void
  setEventDiagnostics: (enabled: boolean) => void
}

export type AppStore = StoreApi<AppState>

export type CreateAppStoreOptions = {
  persist?: boolean
  storageKey?: string
  initialState?: Partial<AppState>
  dependencies?: Partial<AppStoreDependencies>
}

export type AppStoreDependencies = {
  bridge: PlatformBridge
}

const defaultStorageKey = "codex.app-state"

const runtimeSlice: StateCreator<RuntimeSlice, [], []> = (set) => ({
  runtime: {
    hydrationStatus: "idle",
    eventDiagnosticsEnabled: false
  },
  setHydrationStatus: (status) =>
    set((state) => ({
      ...state,
      runtime: {
        ...state.runtime,
        hydrationStatus: status
      }
    })),
  setEventDiagnostics: (enabled) =>
    set((state) => ({
      ...state,
      runtime: {
        ...state.runtime,
        eventDiagnosticsEnabled: enabled
      }
    }))
})

const noopStorage: Storage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  key: () => null,
  length: 0,
  clear: () => undefined
}

const resolveStorage = () => {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage
    }
  } catch {
    // ignore and fall through to noop storage
  }
  return noopStorage
}

/**
 * Factory for the shared Zustand store described in docs/frontend-architecture.md.
 */
export function createAppStore(options: CreateAppStoreOptions = {}): AppStore {
  const { persist: enablePersist = true, storageKey = defaultStorageKey, initialState, dependencies } = options
  const resolvedDependencies: AppStoreDependencies = {
    bridge: dependencies?.bridge ?? platformBridge
  }
  const baseCreator = createRootSlice(resolvedDependencies)
  const withImmer = immer<AppState>(baseCreator)
  const withSelectors = subscribeWithSelector(withImmer)
  const storage = createJSONStorage<Partial<AppState>>(() => resolveStorage())
  const enhancer: StateCreator<AppState, [], []> = enablePersist
    ? (persist(withSelectors, {
        name: storageKey,
        version: 1,
        storage,
        partialize: (state) => ({ runtime: state.runtime })
      }) as unknown as StateCreator<AppState, [], []>)
    : (withSelectors as StateCreator<AppState, [], []>)

  const store = createStore<AppState>()(enhancer)

  if (initialState) {
    store.setState((previous) => ({ ...previous, ...initialState }), true)
  }

  return store
}

const AppStoreContext = createContext<AppStore | null>(null)

export type AppStateProviderProps = {
  children: ReactNode
  store?: AppStore
}

/**
 * React provider that wires the Zustand store next to legacy React Query providers.
 */
export function AppStateProvider({ children, store }: AppStateProviderProps) {
  const storeRef = useRef<AppStore | null>(null)

  if (!storeRef.current) {
    storeRef.current = store ?? createAppStore()
  }

  return <AppStoreContext.Provider value={storeRef.current}>{children}</AppStoreContext.Provider>
}

export function useAppStore<T>(selector: (state: AppState) => T, equalityFn?: (a: T, b: T) => boolean): T {
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new Error("useAppStore must be used within an AppStateProvider")
  }
  return useStore(store, selector, equalityFn)
}

export function useAppStoreApi(): AppStore {
  const store = useContext(AppStoreContext)
  if (!store) {
    throw new Error("useAppStoreApi must be used within an AppStateProvider")
  }
  return store
}

function createRootSlice(dependencies: AppStoreDependencies): StateCreator<AppState, [], []> {
  const projectSlice = createProjectsSlice(dependencies.bridge) as unknown as StateCreator<AppState, [], []>
  const runtime = runtimeSlice as unknown as StateCreator<AppState, [], []>
  const threads = createThreadsSlice(dependencies.bridge) as unknown as StateCreator<AppState, [], []>
  const conversation = createConversationSlice(dependencies.bridge) as unknown as StateCreator<AppState, [], []>
  const streams = createStreamsSlice as unknown as StateCreator<AppState, [], []>
  const terminal = createTerminalSlice as unknown as StateCreator<AppState, [], []>
  const diffs = createDiffSlice as unknown as StateCreator<AppState, [], []>
  return (set, get, api) => ({
    ...runtime(set, get, api),
    ...projectSlice(set, get, api),
    ...threads(set, get, api),
    ...conversation(set, get, api),
    ...streams(set, get, api),
    ...terminal(set, get, api),
    ...diffs(set, get, api)
  })
}
