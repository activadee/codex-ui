import { createContext, useContext, useEffect, useRef, type ReactNode } from "react"

import { ThreadEventRouter } from "@/lib/thread-events/router"

const ThreadEventRouterContext = createContext<ThreadEventRouter | null>(null)

type ThreadEventRouterProviderProps = {
  children: ReactNode
}

export function ThreadEventRouterProvider({ children }: ThreadEventRouterProviderProps) {
  const routerRef = useRef<ThreadEventRouter | null>(null)

  if (!routerRef.current) {
    routerRef.current = new ThreadEventRouter()
  }

  useEffect(() => {
    const router = routerRef.current
    return () => {
      router?.dispose()
    }
  }, [])

  return <ThreadEventRouterContext.Provider value={routerRef.current}>{children}</ThreadEventRouterContext.Provider>
}

export function useThreadEventRouter(): ThreadEventRouter {
  const value = useContext(ThreadEventRouterContext)
  if (!value) {
    throw new Error("useThreadEventRouter must be used within a ThreadEventRouterProvider")
  }
  return value
}
