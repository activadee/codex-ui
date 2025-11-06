import { Sparkles } from "lucide-react"
import { useEffect, useRef } from "react"

import type { ConversationEntry } from "@/types/app"

import { ConversationEntryCard } from "./conversation-entry-card"
import { StreamingIndicator } from "./streaming-indicator"

export type ConversationViewProps = {
  entries: ConversationEntry[]
  isStreaming: boolean
  streamStatus: string
  projectName: string
  threadId?: number | null
}

export function ConversationView({ entries, isStreaming, streamStatus, projectName, threadId }: ConversationViewProps) {
  const hasContent = entries.length > 0
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pendingScrollRef = useRef<boolean>(false)
  const lastEntryId = hasContent ? entries[entries.length - 1].id : "__none__"

  // When the active thread changes, schedule a one-time scroll to bottom.
  useEffect(() => {
    // Mark that we need to scroll once the list stabilizes/loads
    pendingScrollRef.current = true
  }, [threadId])

  // Perform the pending scroll once the thread swaps or the latest entry changes.
  // Keep the pending flag until content is present and we actually scroll.
  useEffect(() => {
    if (!pendingScrollRef.current) return
    // Wait until we render the scroller subtree (i.e., not in the empty placeholder).
    if (!(hasContent || isStreaming)) return

    let raf = 0
    const attempt = () => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "auto", block: "end" })
        pendingScrollRef.current = false
        return
      }
      raf = requestAnimationFrame(attempt)
    }
    raf = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(raf)
  }, [threadId, lastEntryId, hasContent, isStreaming])

  if (!hasContent && !isStreaming) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-8 py-8 text-center text-sm text-muted-foreground">
        <Sparkles className="h-5 w-5" />
        <p>Open or start a conversation for {projectName} to see activity.</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 min-h-0 overflow-hidden bg-white">
      <div className="flex min-w-0 flex-1 min-h-0 flex-col">
        <div className="flex min-w-0 flex-1 min-h-0 overflow-hidden">
          <div ref={scrollContainerRef} className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-1 md:px-6 md:pb-8 md:pt-2">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
              {entries.map((entry) => (
                <ConversationEntryCard key={entry.id} entry={entry} />
              ))}
              {isStreaming && <StreamingIndicator status={streamStatus} />}
              {/* Sentinel used for scroll-to-bottom behavior */}
              <div ref={bottomRef} aria-hidden />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
