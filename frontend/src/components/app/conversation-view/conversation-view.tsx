import { Loader2, Sparkles } from "lucide-react"
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso"
import { useCallback, useEffect, useMemo, useRef } from "react"

import type { ConversationEntry } from "@/types/app"

import { ConversationEntryCard } from "./conversation-entry-card"
import { StreamingIndicator } from "./streaming-indicator"

export type ConversationViewProps = {
  entries: ConversationEntry[]
  hasMore: boolean
  isLoading: boolean
  isFetchingMore: boolean
  onLoadOlder?: () => Promise<unknown> | void
  isStreaming: boolean
  streamStatus: string
  projectName: string
}

export function ConversationView({
  entries,
  hasMore,
  isLoading,
  isFetchingMore,
  onLoadOlder,
  isStreaming,
  streamStatus,
  projectName
}: ConversationViewProps) {
  const hasContent = entries.length > 0

  if (!hasContent && isLoading) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-8 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <p>Loading conversation…</p>
      </div>
    )
  }

  if (!hasContent && !isStreaming) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-8 py-8 text-center text-sm text-muted-foreground">
        <Sparkles className="h-5 w-5" />
        <p>Open or start a conversation for {projectName} to see activity.</p>
      </div>
    )
  }

  const virtuosoRef = useRef<VirtuosoHandle | null>(null)
  const lastTopStateRef = useRef(false)
  const prevLengthRef = useRef(entries.length)
  const wasFetchingMoreRef = useRef(isFetchingMore)

  useEffect(() => {
    if (wasFetchingMoreRef.current && !isFetchingMore) {
      const delta = entries.length - prevLengthRef.current
      if (delta > 0 && virtuosoRef.current) {
        virtuosoRef.current.scrollToIndex({ index: delta, align: "start", behavior: "auto" })
      }
    } else if (prevLengthRef.current === 0 && entries.length > 0 && virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({ index: entries.length - 1, align: "end", behavior: "auto" })
    }
    prevLengthRef.current = entries.length
    wasFetchingMoreRef.current = isFetchingMore
  }, [entries.length, isFetchingMore])

  const handleTopStateChange = useCallback(
    (atTop: boolean) => {
      if (atTop && !lastTopStateRef.current && hasMore && !isFetchingMore && !isLoading) {
        const result = onLoadOlder?.()
        if (result && typeof (result as Promise<unknown>).then === "function") {
          void (result as Promise<unknown>)
        }
      }
      lastTopStateRef.current = atTop
    },
    [hasMore, isFetchingMore, isLoading, onLoadOlder]
  )

  const components = useMemo(
    () => ({
      Header: () =>
        hasMore && isFetchingMore ? (
          <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
            <Loader2 className="mr-2 h-3 w-3 animate-spin" />
            Loading older messages…
          </div>
        ) : null,
      Footer: () =>
        isStreaming ? (
          <div className="px-4 pb-6 pt-1 md:px-6 md:pb-8 md:pt-2">
            <StreamingIndicator status={streamStatus} />
          </div>
        ) : null
    }),
    [hasMore, isFetchingMore, isStreaming, streamStatus]
  )

  return (
    <div className="flex min-w-0 flex-1 min-h-0 overflow-hidden bg-white">
      <div className="flex min-w-0 flex-1 min-h-0 flex-col">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: "100%" }}
          data={entries}
          overscan={200}
          followOutput={isStreaming ? "smooth" : false}
          atTopStateChange={handleTopStateChange}
          computeItemKey={(index, entry) => entry.id}
          components={components}
          itemContent={(index, entry) => (
            <div className="px-4 pb-3 pt-1 md:px-6">
              <ConversationEntryCard entry={entry} />
            </div>
          )}
        />
      </div>
    </div>
  )
}
