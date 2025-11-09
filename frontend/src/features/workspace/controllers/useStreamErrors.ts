import { useCallback, useState } from "react"

export type StreamErrorMap = Partial<Record<number, string>> & { global?: string }

export function useStreamErrors() {
  const [streamErrors, setStreamErrors] = useState<StreamErrorMap>({})

  const updateStreamError = useCallback((message: string | null, threadId?: number) => {
    const key = typeof threadId === "number" ? threadId : "global"
    setStreamErrors((prev) => {
      const next: StreamErrorMap = { ...prev }
      if (!message) {
        if (!(key in next)) {
          return prev
        }
        delete next[key]
        return next
      }
      next[key] = message
      return next
    })
  }, [])

  const getErrorForThread = useCallback(
    (threadId?: number | null) => {
      if (typeof threadId === "number") {
        return streamErrors[threadId] ?? null
      }
      return streamErrors.global ?? null
    },
    [streamErrors]
  )

  return {
    streamErrors,
    updateStreamError,
    getErrorForThread
  }
}
