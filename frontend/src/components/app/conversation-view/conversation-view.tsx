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
  useEffect(() => {
    if (!pendingScrollRef.current) return
    let tries = 0
    const maxTries = 10
    const attempt = () => {
      // Prefer scrolling the bottom sentinel when available
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "auto", block: "end" })
        pendingScrollRef.current = false
        return
      }
      // Fallback to container scroll position
      const el = scrollContainerRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
      }
      // Retry for a few frames to allow content to render
      if (tries < maxTries) {
        tries += 1
        requestAnimationFrame(attempt)
      } else {
        // Give up and clear the pending flag to avoid getting stuck
        pendingScrollRef.current = false
      }
    }
    requestAnimationFrame(attempt)
  }, [threadId, lastEntryId])

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
