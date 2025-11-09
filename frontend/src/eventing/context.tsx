import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"

import { createRuntimeServices } from "@/platform/runtimeServices"

import { EventBus } from "./eventBus"
import { ThreadEventRouter } from "./router"

const ThreadEventRouterContext = createContext<ThreadEventRouter | null>(null)
const EventBusContext = createContext<EventBus | null>(null)

type ThreadEventRouterProviderProps = {
  children: ReactNode
  diagnosticsEnabled?: boolean
}

const diagnosticsFlag = (() => {
  try {
    return (import.meta.env?.VITE_EVENTBUS_DIAGNOSTICS ?? "false") === "true"
  } catch {
    return false
  }
})()

export function ThreadEventRouterProvider({ children, diagnosticsEnabled }: ThreadEventRouterProviderProps) {
  const diagnosticsPreference = diagnosticsEnabled ?? diagnosticsFlag
  const servicesRef = useRef(createRuntimeServices())
  const busRef = useRef<EventBus | null>(null)
  const routerRef = useRef<ThreadEventRouter | null>(null)

  if (!busRef.current) {
    busRef.current = new EventBus({
      diagnostics: servicesRef.current.diagnostics.scoped("eventBus"),
      diagnosticsEnabled: diagnosticsPreference
    })
  }

  if (!routerRef.current && busRef.current) {
    routerRef.current = new ThreadEventRouter(busRef.current)
  }

  useEffect(() => {
    const router = routerRef.current
    return () => {
      router?.dispose()
    }
  }, [])

  useEffect(() => {
    busRef.current?.toggleDiagnostics(diagnosticsPreference)
  }, [diagnosticsPreference])

  return (
    <EventBusContext.Provider value={busRef.current}>
      <ThreadEventRouterContext.Provider value={routerRef.current}>{children}</ThreadEventRouterContext.Provider>
    </EventBusContext.Provider>
  )
}

export function useThreadEventRouter(): ThreadEventRouter {
  const value = useContext(ThreadEventRouterContext)
  if (!value) {
    throw new Error("useThreadEventRouter must be used within a ThreadEventRouterProvider")
  }
  return value
}

export function useEventBus(): EventBus {
  const value = useContext(EventBusContext)
  if (!value) {
    throw new Error("useEventBus must be used within a ThreadEventRouterProvider")
  }
  return value
}
