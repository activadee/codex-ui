import { useCallback, useEffect, useMemo, useRef } from "react"

import { agents } from "../../../../wailsjs/go/models"
import { useEventBus, useThreadEventRouter } from "@/eventing"
import { streamTopic } from "@/platform/eventChannels"
import { platformBridge } from "@/platform/wailsBridge"
import { useAppStore, useAppStoreApi } from "@/state/createAppStore"
import type { StreamEventPayload } from "@/types/app"

import type { ThreadStreamState } from "@/features/streams/state/streamsSlice"

type StreamContext = { threadId?: number; streamId?: string }

type UseAgentStreamOptions = {
  onEvent?: (event: StreamEventPayload, context: StreamContext) => void
  onComplete?: (threadId: number, status: string, streamId?: string) => void
  onError?: (message: string, context: StreamContext) => void
}

const idleState: ThreadStreamState = {
  status: "idle",
  error: null
}

export function useAgentStream(options: UseAgentStreamOptions = {}) {
  const optionsRef = useRef(options)
  const router = useThreadEventRouter()
  const eventBus = useEventBus()
  const storeApi = useAppStoreApi()

  useEffect(() => {
    optionsRef.current = options
  }, [options])

  const threadStreams = useAppStore((state) => state.threadStreams)
  const setThreadStreamState = useAppStore((state) => state.setThreadStreamState)

  const updateThreadState = useCallback(
    (threadId: number, updater: (prev: ThreadStreamState) => ThreadStreamState) => {
      setThreadStreamState(threadId, updater)
    },
    [setThreadStreamState]
  )

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
        const status = event.type === "stream.complete" ? "completed" : "error"
        updateThreadState(threadId, (prev) => ({
          ...prev,
          status,
          error: event.error?.message ?? prev.error ?? null,
          streamId: undefined
        }))
        optionsRef.current.onComplete?.(threadId, event.message ?? status, streamId)
      }

      eventBus.publish(streamTopic(streamId), event, event.type === "stream.error" ? "high" : "default", "runtime.stream")
    },
    [eventBus, updateThreadState]
  )

  const startStream = useCallback(
    async (payload: agents.MessageRequest) => {
      const targetThreadId = typeof payload.threadId === "number" ? payload.threadId : undefined
      if (targetThreadId) {
        const currentState = storeApi.getState().threadStreams[targetThreadId]
        if (currentState?.status === "streaming") {
          throw new Error("That thread already has an active stream")
        }
      }

      const handle = await platformBridge.threads.sendMessage(payload)
      router.registerStream(handle)
      updateThreadState(handle.threadId, () => ({
        streamId: handle.streamId,
        status: "streaming",
        usage: undefined,
        error: null
      }))
      return handle
    },
    [router, storeApi, updateThreadState]
  )

  const cancelStream = useCallback(
    async (threadId?: number) => {
      let targetThreadId = threadId
      if (targetThreadId === undefined) {
        const entries = Object.entries(storeApi.getState().threadStreams)
        const activeThreads = entries.filter(([, state]) => state.status === "streaming")
        if (activeThreads.length !== 1) {
          return
        }
        targetThreadId = Number(activeThreads[0][0])
      }
      if (targetThreadId === undefined) {
        return
      }
      const current = storeApi.getState().threadStreams[targetThreadId]
      const streamId = current?.streamId
      if (!streamId) {
        return
      }
      try {
        const response = await platformBridge.threads.cancelStream(streamId)
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
    [router, storeApi, updateThreadState]
  )

  useEffect(() => router.subscribeToStream(undefined, handleStreamEvent), [router, handleStreamEvent])

  const isAnyStreaming = useMemo(() => Object.values(threadStreams).some((state) => state.status === "streaming"), [threadStreams])

  const getThreadState = useCallback(
    (threadId?: number): ThreadStreamState => {
      const states = storeApi.getState().threadStreams
      if (!threadId) {
        const activeEntry = Object.values(states).find((state) => state.status === "streaming")
        return activeEntry ?? idleState
      }
      return states[threadId] ?? idleState
    },
    [storeApi]
  )

  return {
    startStream,
    cancelStream,
    isAnyStreaming,
    threadStates: threadStreams,
    getThreadState
  }
}
