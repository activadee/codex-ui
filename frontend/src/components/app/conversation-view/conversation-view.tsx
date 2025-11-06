import { Loader2, Sparkles } from "lucide-react"
import { Virtuoso } from "react-virtuoso"
import { useCallback, useMemo } from "react"

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

  const handleStartReached = useCallback(() => {
    if (!hasMore || isFetchingMore) {
      return
    }
    if (onLoadOlder) {
      void onLoadOlder()
    }
  }, [hasMore, isFetchingMore, onLoadOlder])

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
          style={{ height: "100%" }}
          data={entries}
          overscan={200}
          followOutput="auto"
          startReached={handleStartReached}
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
