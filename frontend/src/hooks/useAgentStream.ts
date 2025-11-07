import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Cancel, Send } from "../../wailsjs/go/agents/API"
import { agents } from "../../wailsjs/go/models"
import { useThreadEventRouter } from "@/lib/thread-events"
import type { AgentUsage, StreamEventPayload } from "@/types/app"

type StreamStatus = "idle" | "streaming" | "completed" | "stopped" | "error"

type StreamContext = { threadId?: number; streamId?: string }

type UseAgentStreamOptions = {
  onComplete?: (threadId: number, status: string, streamId?: string) => void
  onError?: (message: string, context: StreamContext) => void
}

export type AgentStreamState = {
  threadId?: number
  streamId?: string
  status: StreamStatus
  usage?: AgentUsage
  error: string | null
}

const idleState: AgentStreamState = {
  status: "idle",
  error: null
}

export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const [threadStates, setThreadStates] = useState<Record<number, AgentStreamState>>({})
  const threadStatesRef = useRef<Record<number, AgentStreamState>>({})
  const optionsRef = useRef(options)
  const router = useThreadEventRouter()

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const updateThreadState = useCallback((threadId: number, updater: (prev: AgentStreamState) => AgentStreamState) => {
    setThreadStates((prev) => {
      const current = prev[threadId] ?? idleState
      const next = updater({ ...current, threadId })
      const updated = { ...prev, [threadId]: next }
      threadStatesRef.current = updated
      return updated
    })
  }, [])

  const handleStreamEvent = useCallback(
    (event: StreamEventPayload, context: StreamContext) => {
      const { threadId, streamId } = context
      if (!threadId || !streamId) {
        return
      }

      if (event.usage) {
        updateThreadState(threadId, (prev) => ({ ...prev, streamId, usage: event.usage }))
      }

      if (event.error?.message) {
        const message = event.error.message
        updateThreadState(threadId, (prev) => ({ ...prev, streamId, status: "error", error: message }))
        optionsRef.current.onError?.(message, context)
      }

      if (event.type === "stream.complete" || event.type === "stream.error") {
        const status: StreamStatus = event.type === "stream.complete" ? "completed" : "error"
        updateThreadState(threadId, (prev) => ({
          ...prev,
          streamId: undefined,
          status,
          error: event.error?.message ?? prev.error ?? null
        }))
        optionsRef.current.onComplete?.(threadId, event.message ?? status, streamId)
      }
    },
    [updateThreadState]
  )

  useEffect(() => router.subscribeToStream(undefined, handleStreamEvent), [router, handleStreamEvent])

  const startStream = useCallback(
    async (payload: agents.MessageRequest) => {
      const handle = await Send(payload)
      router.registerStream(handle)
      updateThreadState(handle.threadId, () => ({
        threadId: handle.threadId,
        streamId: handle.streamId,
        status: "streaming",
        usage: undefined,
        error: null
      }))
      return handle
    },
    [router, updateThreadState]
  )

  const cancelStream = useCallback(
    async (threadId?: number) => {
      let targetThreadId = threadId
      if (targetThreadId === undefined) {
        const activeThreads = Object.entries(threadStatesRef.current).filter(([, state]) => state.status === "streaming")
        if (activeThreads.length !== 1) {
          return
        }
        targetThreadId = Number(activeThreads[0][0])
      }
      if (targetThreadId === undefined) {
        return
      }
      const current = threadStatesRef.current[targetThreadId]
      const activeStreamId = current?.streamId
      if (!activeStreamId) {
        return
      }
      try {
        const response = await Cancel(activeStreamId)
        router.unregisterStream(activeStreamId)
        updateThreadState(targetThreadId, (prev) => ({ ...prev, status: "stopped", streamId: undefined }))
        optionsRef.current.onComplete?.(response.threadId, response.status, activeStreamId)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to cancel stream"
        updateThreadState(targetThreadId, (prev) => ({ ...prev, error: message, status: "error" }))
        optionsRef.current.onError?.(message, { threadId: targetThreadId, streamId: activeStreamId })
      }
    },
    [router, updateThreadState]
  )

  const getThreadState = useCallback(
    (threadId?: number): AgentStreamState => {
      if (typeof threadId === "number" && threadId > 0) {
        return threadStates[threadId] ?? idleState
      }
      const active = Object.values(threadStates).find((state) => state.status === "streaming")
      return active ?? idleState
    },
    [threadStates]
  )

  const isAnyStreaming = useMemo(
    () => Object.values(threadStatesRef.current).some((state) => state.status === "streaming"),
    [threadStates]
  )

  return {
    startStream,
    cancelStream,
    getThreadState,
    isAnyStreaming,
    threadStates
  }
}
