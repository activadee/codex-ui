import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Cancel, Send } from "../../wailsjs/go/agents/API"
import { agents } from "../../wailsjs/go/models"
import { useThreadEventRouter } from "@/lib/thread-events"
import type { AgentUsage, StreamEventPayload } from "@/types/app"

type StreamStatus = "idle" | "streaming" | "completed" | "stopped" | "error"

type StreamContext = { threadId?: number; streamId?: string }

type UseAgentStreamOptions = {
  threadId?: number
  onEvent?: (event: StreamEventPayload, context: StreamContext) => void
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
  const [streamState, setStreamState] = useState<AgentStreamState>(idleState)
  const [listeningThreadId, setListeningThreadId] = useState<number | undefined>(options.threadId)
  const optionsRef = useRef(options)
  const router = useThreadEventRouter()
  const streamThreadRef = useRef<number | undefined>(undefined)
  const streamIdRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  useEffect(() => {
    if (options.threadId === undefined) {
      if (!streamThreadRef.current) {
        setListeningThreadId(undefined)
      }
    } else {
      setListeningThreadId(options.threadId)
    }
  }, [options.threadId])

  const updateState = useCallback((updater: (prev: AgentStreamState) => AgentStreamState) => {
    setStreamState((prev) => updater(prev))
  }, [])

  const clearStreamRefs = useCallback(() => {
    streamThreadRef.current = undefined
    streamIdRef.current = undefined
    if (optionsRef.current.threadId === undefined) {
      setListeningThreadId(undefined)
    } else {
      setListeningThreadId(optionsRef.current.threadId)
    }
  }, [])

  const handleStreamEvent = useCallback(
    (event: StreamEventPayload, context: StreamContext) => {
      const { threadId, streamId } = context
      if (!threadId || !streamId) {
        return
      }

      streamThreadRef.current = threadId
      streamIdRef.current = streamId

      optionsRef.current.onEvent?.(event, context)

      if (event.usage) {
        updateState((prev) => ({ ...prev, threadId, usage: event.usage }))
      }

      if (event.error?.message) {
        const message = event.error.message
        updateState((prev) => ({ ...prev, threadId, status: "error", error: message }))
        optionsRef.current.onError?.(message, context)
      }

      if (event.type === "stream.complete" || event.type === "stream.error") {
        const status: StreamStatus = event.type === "stream.complete" ? "completed" : "error"
        updateState((prev) => ({
          ...prev,
          threadId,
          status,
          error: event.error?.message ?? prev.error ?? null,
          streamId: undefined
        }))
        optionsRef.current.onComplete?.(threadId, event.message ?? status, streamId)
        clearStreamRefs()
      }
    },
    [clearStreamRefs, updateState]
  )

  useEffect(() => {
    if (!listeningThreadId) {
      return
    }
    return router.subscribeToStream(listeningThreadId, handleStreamEvent)
  }, [router, handleStreamEvent, listeningThreadId])

  const startStream = useCallback(
    async (payload: agents.MessageRequest) => {
      if (streamIdRef.current) {
        throw new Error("A stream is already running")
      }

      const handle = await Send(payload)
      router.registerStream(handle)
      streamThreadRef.current = handle.threadId
      streamIdRef.current = handle.streamId
      setListeningThreadId(handle.threadId)
      setStreamState({
        threadId: handle.threadId,
        streamId: handle.streamId,
        status: "streaming",
        usage: undefined,
        error: null
      })
      return handle
    },
    [router, options.threadId]
  )

  const cancelStream = useCallback(
    async (threadId?: number) => {
      const activeStreamId = streamIdRef.current
      if (!activeStreamId) {
        return
      }

      try {
        const response = await Cancel(activeStreamId)
        router.unregisterStream(activeStreamId)
        updateState((prev) => ({
          ...prev,
          status: "stopped",
          streamId: undefined
        }))
        optionsRef.current.onComplete?.(response.threadId, response.status, activeStreamId)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to cancel stream"
        updateState((prev) => ({ ...prev, error: message, status: "error" }))
        optionsRef.current.onError?.(message, { threadId: threadId ?? streamThreadRef.current, streamId: activeStreamId })
      } finally {
        clearStreamRefs()
      }
    },
    [clearStreamRefs, router, updateState]
  )

  useEffect(() => {
    if (!streamIdRef.current) {
      return
    }
    if (options.threadId !== undefined && streamThreadRef.current && streamThreadRef.current !== options.threadId) {
      void cancelStream(streamThreadRef.current)
    }
  }, [cancelStream, options.threadId])

  const isStreaming = streamState.status === "streaming"

  const state = useMemo<AgentStreamState>(() => ({
    threadId: streamState.threadId,
    streamId: streamIdRef.current,
    status: streamState.status,
    usage: streamState.usage,
    error: streamState.error
  }), [streamState])

  return {
    startStream,
    cancelStream,
    state,
    isStreaming
  }
}
