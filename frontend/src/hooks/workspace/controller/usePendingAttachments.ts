import { useCallback, useEffect, useRef } from "react"

import { DeleteAttachment } from "../../../../wailsjs/go/main/App"

export function usePendingAttachments() {
  const pendingAttachmentsRef = useRef<Map<string, string[]>>(new Map())

  const registerPendingAttachments = useCallback((streamId: string | undefined, paths: string[]) => {
    if (!streamId || paths.length === 0) {
      return
    }
    pendingAttachmentsRef.current.set(streamId, paths)
  }, [])

  useEffect(() => {
    return () => {
      const pending = Array.from(pendingAttachmentsRef.current.values()).flat()
      pendingAttachmentsRef.current.clear()
      pending.forEach((path) => {
        void DeleteAttachment(path).catch((error) => {
          console.error("Failed to delete pending attachment on cleanup", error)
        })
      })
    }
  }, [])

  return {
    pendingAttachmentsRef,
    registerPendingAttachments
  }
}
