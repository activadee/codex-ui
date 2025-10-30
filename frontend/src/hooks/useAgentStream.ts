import { useCallback, useEffect, useRef, useState } from "react"

import { CancelAgentStream, SendAgentMessage } from "../../wailsjs/go/main/App"
import { agents } from "../../wailsjs/go/models"
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime"
import { streamTopic } from "@/lib/threads"
import type { AgentUsage, StreamEventPayload } from "@/types/app"

type StreamStatus = "idle" | "streaming" | "completed" | "stopped" | "error"

type UseAgentStreamOptions = {
  onEvent?: (event: StreamEventPayload, context: { threadId?: number; streamId?: string }) => void
  onComplete?: (threadId: number, status: string, streamId?: string) => void
  onError?: (message: string) => void
}

type StreamState = {
  streamId?: string
  threadId?: number
  status: StreamStatus
  usage?: AgentUsage
  error?: string | null
}

const initialState: StreamState = {
  status: "idle",
  error: null
}

export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const [state, setState] = useState<StreamState>(initialState)
  const listenerRef = useRef<string | null>(null)
  const threadIdRef = useRef<number | undefined>(undefined)
  const statusRef = useRef<StreamStatus>("idle")
  const streamIdRef = useRef<string | undefined>(undefined)

  const updateState = useCallback((updater: (prev: StreamState) => StreamState) => {
    setState((prev) => {
      const next = updater(prev)
      threadIdRef.current = next.threadId
      statusRef.current = next.status
      streamIdRef.current = next.streamId
      return next
    })
  }, [])

  const cleanupListener = useCallback(() => {
    if (listenerRef.current) {
      EventsOff(listenerRef.current)
      listenerRef.current = null
    }
  }, [])

  const handleEvent = useCallback(
    (event: StreamEventPayload) => {
      if (!event) {
        return
      }
      if (options.onEvent) {
        options.onEvent(event, { threadId: threadIdRef.current, streamId: streamIdRef.current })
      }
      if (event.usage) {
        updateState((prev) => ({ ...prev, usage: event.usage }))
      }
      if (event.error) {
        const message = event.error.message
        updateState((prev) => ({ ...prev, status: "error", error: message, streamId: undefined }))
        if (options.onError) {
          options.onError(message)
        }
      }
      if (event.type === "stream.complete" || event.type === "stream.error") {
        cleanupListener()
        const completedStreamId = streamIdRef.current
        updateState((prev) => ({
          ...prev,
          status: event.type === "stream.complete" ? "completed" : "error",
          error: event.error?.message ?? prev.error,
          streamId: undefined
        }))
        if (threadIdRef.current && options.onComplete) {
          options.onComplete(threadIdRef.current, event.message ?? statusRef.current, completedStreamId)
        }
      }
    },
    [cleanupListener, options, updateState]
  )

  const startStream = useCallback(
    async (payload: agents.MessageRequest) => {
      if (state.status === "streaming") {
        throw new Error("A stream is already in progress")
      }
      const handle = await SendAgentMessage(payload)
      const topic = streamTopic(handle.streamId)
      updateState(() => ({
        streamId: handle.streamId,
        threadId: handle.threadId,
        status: "streaming",
        usage: undefined,
        error: null
      }))
      listenerRef.current = topic
      EventsOn(topic, handleEvent)
      return handle
    },
    [handleEvent, state.status, updateState]
  )

  const cancelStream = useCallback(async () => {
    if (!state.streamId) {
      return
    }
    try {
      const response = await CancelAgentStream(state.streamId)
      const cancelledStreamId = streamIdRef.current
      updateState((prev) => ({ ...prev, status: "stopped", streamId: undefined }))
      if (options.onComplete) {
        options.onComplete(response.threadId, response.status, cancelledStreamId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel stream"
      updateState((prev) => ({ ...prev, status: "error", error: message }))
      if (options.onError) {
        options.onError(message)
      }
    } finally {
      cleanupListener()
    }
  }, [cleanupListener, options, state.streamId, updateState])

  useEffect(() => {
    return () => {
      cleanupListener()
    }
  }, [cleanupListener])

  return {
    startStream,
    cancelStream,
    isStreaming: state.status === "streaming",
    status: state.status,
    streamId: state.streamId,
    threadId: state.threadId,
    usage: state.usage,
    error: state.error
  }
}
