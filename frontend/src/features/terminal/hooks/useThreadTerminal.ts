import { useCallback, useEffect, useRef } from "react"

import { useThreadEventRouter, type TerminalEvent } from "@/eventing"
import { platformBridge } from "@/platform/wailsBridge"
import { useAppStore } from "@/state/createAppStore"
import { getIdleTerminalSession, type TerminalStatus } from "@/state/slices/terminalSlice"

type TerminalListenerEvent =
  | { type: "ready" }
  | { type: "output"; data: Uint8Array }
  | { type: "exit"; status?: string }

type UseThreadTerminalResponse = {
  status: TerminalStatus
  error: string | null
  exitStatus: string | null
  start: () => Promise<void>
  stop: () => Promise<void>
  send: (data: string) => Promise<void>
  resize: (cols: number, rows: number) => Promise<void>
  subscribe: (listener: (event: TerminalListenerEvent) => void) => () => void
}

export function useThreadTerminal(threadId?: number): UseThreadTerminalResponse {
  const terminalSession = useAppStore((state) =>
    threadId ? state.terminalSessions[threadId] ?? getIdleTerminalSession() : getIdleTerminalSession()
  )
  const setTerminalSession = useAppStore((state) => state.setTerminalSession)
  const resetTerminalSession = useAppStore((state) => state.resetTerminalSession)
  const listenersRef = useRef(new Set<(event: TerminalListenerEvent) => void>())
  const activeThreadRef = useRef<number | undefined>(threadId)
  const router = useThreadEventRouter()

  const broadcast = useCallback((event: TerminalListenerEvent) => {
    listenersRef.current.forEach((listener) => {
      try {
        listener(event)
      } catch (err) {
        console.error("Terminal listener error", err)
      }
    })
  }, [])

  const start = useCallback(async () => {
    if (!threadId) {
      return
    }
    const currentThreadId = threadId
    setTerminalSession(currentThreadId, () => ({ status: "connecting", error: null, exitStatus: null }))
    try {
      await platformBridge.terminal.start(currentThreadId)
      if (activeThreadRef.current === currentThreadId) {
        setTerminalSession(currentThreadId, (prev) => ({ ...prev, status: "ready", error: null }))
        broadcast({ type: "ready" })
      }
    } catch (err) {
      if (activeThreadRef.current !== currentThreadId) {
        return
      }
      const message = err instanceof Error ? err.message : "Failed to start terminal"
      setTerminalSession(currentThreadId, () => ({ status: "error", error: message, exitStatus: null }))
    }
  }, [broadcast, setTerminalSession, threadId])

  const stop = useCallback(async () => {
    if (!threadId) {
      return
    }
    try {
      await platformBridge.terminal.stop(threadId)
    } catch (err) {
      console.error("Failed to stop terminal", err)
    }
  }, [threadId])

  const send = useCallback(
    async (data: string) => {
      if (!threadId || !data) {
        return
      }
      try {
        await platformBridge.terminal.write(threadId, data)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to write to terminal"
        setTerminalSession(threadId, (prev) => ({ ...prev, status: "error", error: message }))
      }
    },
    [setTerminalSession, threadId]
  )

  const resize = useCallback(async (cols: number, rows: number) => {
    if (!threadId) {
      return
    }
    try {
      await platformBridge.terminal.resize(threadId, cols, rows)
    } catch (err) {
      console.error("Failed to resize terminal", err)
    }
  }, [threadId])

  useEffect(() => {
    const previousThreadId = activeThreadRef.current
    activeThreadRef.current = threadId
    if (!threadId) {
      if (previousThreadId) {
        resetTerminalSession(previousThreadId)
      }
      return
    }
    const unsubscribe = router.subscribeToTerminal(threadId, (payload: TerminalEvent) => {
      if (!payload || payload.threadId !== activeThreadRef.current) {
        return
      }
      switch (payload.type) {
        case "ready":
          setTerminalSession(payload.threadId, (prev) => ({ ...prev, status: "ready", error: null }))
          broadcast({ type: "ready" })
          break
        case "output":
          if (!payload.data) {
            return
          }
          broadcast({ type: "output", data: decodeBase64(payload.data) })
          break
        case "exit":
          setTerminalSession(payload.threadId, (prev) => ({ ...prev, status: "exited", exitStatus: payload.status ?? null }))
          broadcast({ type: "exit", status: payload.status })
          break
        default:
          break
      }
    })
    void start()
    return () => {
      unsubscribe()
      void platformBridge.terminal.stop(threadId)
    }
  }, [broadcast, resetTerminalSession, router, start, threadId])

  const subscribe = useCallback((listener: (event: TerminalListenerEvent) => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  return {
    status: terminalSession.status,
    error: terminalSession.error,
    exitStatus: terminalSession.exitStatus,
    start,
    stop,
    send,
    resize,
    subscribe
  }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value)
  const length = binary.length
  const bytes = new Uint8Array(length)
  for (let i = 0; i < length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
