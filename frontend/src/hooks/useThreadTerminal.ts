import { useCallback, useEffect, useRef, useState } from "react"

import {
  ResizeThreadTerminal,
  StartThreadTerminal,
  StopThreadTerminal,
  WriteThreadTerminal
} from "../../wailsjs/go/main/App"
import { EventsOn } from "../../wailsjs/runtime/runtime"
import { terminalTopic } from "@/lib/threads"

type TerminalWireEvent = {
  threadId: number
  type: "ready" | "output" | "exit"
  data?: string
  status?: string
}

type TerminalListenerEvent =
  | { type: "ready" }
  | { type: "output"; data: Uint8Array }
  | { type: "exit"; status?: string }

type TerminalStatus = "idle" | "connecting" | "ready" | "exited" | "error"

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
  const [status, setStatus] = useState<TerminalStatus>("idle")
  const [error, setError] = useState<string | null>(null)
  const [exitStatus, setExitStatus] = useState<string | null>(null)
  const listenerIdRef = useRef<(() => void) | null>(null)
  const listenersRef = useRef(new Set<(event: TerminalListenerEvent) => void>())
  const activeThreadRef = useRef<number | undefined>(threadId)

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
    setStatus("connecting")
    setExitStatus(null)
    setError(null)
    try {
      await StartThreadTerminal(currentThreadId)
      if (activeThreadRef.current === currentThreadId) {
        setStatus("ready")
        broadcast({ type: "ready" })
      }
    } catch (err) {
      if (activeThreadRef.current !== currentThreadId) {
        return
      }
      const message = err instanceof Error ? err.message : "Failed to start terminal"
      setError(message)
      setStatus("error")
    }
  }, [broadcast, threadId])

  const stop = useCallback(async () => {
    if (!threadId) {
      return
    }
    try {
      await StopThreadTerminal(threadId)
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
        await WriteThreadTerminal(threadId, data)
      } catch (err) {
        if (status !== "error") {
          const message = err instanceof Error ? err.message : "Failed to write to terminal"
          setError(message)
          setStatus("error")
        }
      }
    },
    [status, threadId]
  )

  const resize = useCallback(async (cols: number, rows: number) => {
    if (!threadId) {
      return
    }
    try {
      await ResizeThreadTerminal(threadId, cols, rows)
    } catch (err) {
      console.error("Failed to resize terminal", err)
    }
  }, [threadId])

  useEffect(() => {
    activeThreadRef.current = threadId
    if (listenerIdRef.current) {
      listenerIdRef.current()
      listenerIdRef.current = null
    }
    if (!threadId) {
      setStatus("idle")
      setExitStatus(null)
      setError(null)
      return
    }
    const topic = terminalTopic(threadId)
    const handleEvent = (payload: TerminalWireEvent) => {
      if (!payload || payload.threadId !== activeThreadRef.current) {
        return
      }
      switch (payload.type) {
        case "ready":
          setStatus("ready")
          broadcast({ type: "ready" })
          break
        case "output":
          if (!payload.data) {
            return
          }
          broadcast({ type: "output", data: decodeBase64(payload.data) })
          break
        case "exit":
          setStatus("exited")
          setExitStatus(payload.status ?? null)
          broadcast({ type: "exit", status: payload.status })
          break
        default:
          break
      }
    }
    listenerIdRef.current = EventsOn(topic, handleEvent)
    void start()
    return () => {
      if (listenerIdRef.current) {
        listenerIdRef.current()
        listenerIdRef.current = null
      }
      void StopThreadTerminal(threadId)
    }
  }, [broadcast, start, threadId])

  const subscribe = useCallback((listener: (event: TerminalListenerEvent) => void) => {
    listenersRef.current.add(listener)
    return () => {
      listenersRef.current.delete(listener)
    }
  }, [])

  return {
    status,
    error,
    exitStatus,
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
