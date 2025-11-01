import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { CancelAgentStream, SendAgentMessage } from "../../wailsjs/go/main/App"
import { agents } from "../../wailsjs/go/models"
import { EventsOff, EventsOn } from "../../wailsjs/runtime/runtime"
import { streamTopic } from "@/lib/threads"
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
  const listenerRefs = useRef<Map<string, string>>(new Map())
  const streamThreadMap = useRef<Map<string, number>>(new Map())
  const optionsRef = useRef(options)

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

  const cleanupListener = useCallback((streamId: string) => {
    const topic = listenerRefs.current.get(streamId)
    if (topic) {
      EventsOff(topic)
      listenerRefs.current.delete(streamId)
    }
  }, [])

  const handleStreamEvent = useCallback(
    (streamId: string, event: StreamEventPayload) => {
      const threadId = streamThreadMap.current.get(streamId)
      if (!threadId) {
        return
      }

      const context: StreamContext = { threadId, streamId }

      if (optionsRef.current.onEvent) {
        optionsRef.current.onEvent(event, context)
      }

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
        cleanupListener(streamId)
        streamThreadMap.current.delete(streamId)
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
    [cleanupListener, updateThreadState]
  )

  const startStream = useCallback(
    async (payload: agents.MessageRequest) => {
      const targetThreadId = typeof payload.threadId === "number" ? payload.threadId : undefined
      if (targetThreadId && threadStatesRef.current[targetThreadId]?.status === "streaming") {
        throw new Error("That thread already has an active stream")
      }

      const handle = await SendAgentMessage(payload)
      const topic = streamTopic(handle.streamId)
      streamThreadMap.current.set(handle.streamId, handle.threadId)
      listenerRefs.current.set(handle.streamId, topic)
      EventsOn(topic, (event) => handleStreamEvent(handle.streamId, event))
      updateThreadState(handle.threadId, () => ({
        streamId: handle.streamId,
        status: "streaming",
        usage: undefined,
        error: null
      }))
      return handle
    },
    [handleStreamEvent, updateThreadState]
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
      let streamId = current?.streamId
      if (!streamId) {
        const fallback = Array.from(streamThreadMap.current.entries()).find(([, id]) => id === targetThreadId)
        if (!fallback) {
          return
        }
        streamId = fallback[0]
      }
      try {
        const response = await CancelAgentStream(streamId)
        cleanupListener(streamId)
        streamThreadMap.current.delete(streamId)
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
          status: "error",
          error: message,
          streamId: undefined
        }))
        optionsRef.current.onError?.(message, { threadId: targetThreadId, streamId })
      }
    },
    [cleanupListener, updateThreadState]
  )

  useEffect(() => {
    return () => {
      listenerRefs.current.forEach((topic) => {
        EventsOff(topic)
      })
      listenerRefs.current.clear()
      streamThreadMap.current.clear()
    }
  }, [])

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
