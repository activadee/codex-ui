import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { CancelAgentStream, SendAgentMessage } from "../../wailsjs/go/main/App"
import { agents } from "../../wailsjs/go/models"
import { useThreadEventRouter } from "@/lib/thread-events"
import type { AgentUsage, StreamEventPayload } from "@/types/app"

type StreamStatus = "idle" | "streaming" | "completed" | "stopped" | "error"

type StreamContext = { threadId?: number; streamId?: string }

type UseAgentStreamOptions = {
  onEvent?: (event: StreamEventPayload, context: StreamContext) => void
  onComplete?: (threadId: number, status: string, streamId?: string) => void
  onError?: (message: string, context: StreamContext) => void
}

type ThreadStreamState = {
  streamId?: string
  status: StreamStatus
  usage?: AgentUsage
  error?: string | null
}

const idleState: ThreadStreamState = {
  status: "idle",
  error: null
}

export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const [threadStates, setThreadStates] = useState<Record<number, ThreadStreamState>>({})
  const threadStatesRef = useRef<Record<number, ThreadStreamState>>({})
  const optionsRef = useRef(options)
  const router = useThreadEventRouter()

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const updateThreadState = useCallback((threadId: number, updater: (prev: ThreadStreamState) => ThreadStreamState) => {
    setThreadStates((prev) => {
      const current = prev[threadId] ?? idleState
      const next = updater(current)
      const updated: Record<number, ThreadStreamState> = { ...prev, [threadId]: next }
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

      optionsRef.current.onEvent?.(event, context)

      if (event.usage) {
        updateThreadState(threadId, (prev) => ({ ...prev, usage: event.usage }))
      }

      if (event.error?.message) {
        const message = event.error.message
        updateThreadState(threadId, (prev) => ({
          ...prev,
          status: "error",
          error: message
        }))
        optionsRef.current.onError?.(message, context)
      }

      if (event.type === "stream.complete" || event.type === "stream.error") {
        const status: StreamStatus = event.type === "stream.complete" ? "completed" : "error"
        updateThreadState(threadId, (prev) => ({
          ...prev,
          status,
          error: event.error?.message ?? prev.error ?? null,
          streamId: undefined
        }))
        optionsRef.current.onComplete?.(threadId, event.message ?? status, streamId)
      }
    },
    [updateThreadState]
  )

  const startStream = useCallback(
    async (payload: agents.MessageRequest) => {
      const targetThreadId = typeof payload.threadId === "number" ? payload.threadId : undefined
      if (targetThreadId && threadStatesRef.current[targetThreadId]?.status === "streaming") {
        throw new Error("That thread already has an active stream")
      }

      const handle = await SendAgentMessage(payload)
      router.registerStream(handle)
      updateThreadState(handle.threadId, () => ({
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
        const activeThreads = Object.entries(threadStatesRef.current).filter(
          ([, state]) => state.status === "streaming"
        )
        if (activeThreads.length !== 1) {
          return
        }
        targetThreadId = Number(activeThreads[0][0])
      }
      if (targetThreadId === undefined) {
        return
      }
      const current = threadStatesRef.current[targetThreadId]
      const streamId = current?.streamId
      if (!streamId) {
        return
      }
      try {
        const response = await CancelAgentStream(streamId)
        router.unregisterStream(streamId)
        updateThreadState(targetThreadId, (prev) => ({
          ...prev,
          status: "stopped",
          streamId: undefined
        }))
        optionsRef.current.onComplete?.(response.threadId, response.status, streamId)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to cancel stream"
        updateThreadState(targetThreadId, (prev) => ({
          ...prev,
          error: message
        }))
        optionsRef.current.onError?.(message, { threadId: targetThreadId, streamId })
      }
    },
    [router, updateThreadState]
  )
  useEffect(() => router.subscribeToStream(undefined, handleStreamEvent), [router, handleStreamEvent])

  const isAnyStreaming = useMemo(
    () => Object.values(threadStatesRef.current).some((state) => state.status === "streaming"),
    [threadStates]
  )

  const getThreadState = useCallback(
    (threadId?: number): ThreadStreamState => {
      if (!threadId) {
        const active = Object.values(threadStates).find((state) => state.status === "streaming")
        return active ?? idleState
      }
      return threadStates[threadId] ?? idleState
    },
    [threadStates]
  )

  return {
    startStream,
    cancelStream,
    isAnyStreaming,
    threadStates,
    getThreadState
  }
}
