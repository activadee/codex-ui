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

  // When the active thread changes, schedule a one-time scroll to bottom.
  useEffect(() => {
    // Mark that we need to scroll once the list stabilizes/loads
    pendingScrollRef.current = true
  }, [threadId])

  // Perform the pending scroll once entries update after a thread change.
  useEffect(() => {
    if (!pendingScrollRef.current) return
    // Try to scroll immediately; if items are not rendered yet, rAF will try again next frame.
    const scrollToBottom = () => {
      if (bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: "auto", block: "end" })
        pendingScrollRef.current = false
        return
      }
      // Fallback: scroll container to its scrollHeight
      const el = scrollContainerRef.current
      if (el) {
        el.scrollTop = el.scrollHeight
        pendingScrollRef.current = false
        return
      }
      // If neither exists yet, try next frame
      requestAnimationFrame(scrollToBottom)
    }
    scrollToBottom()
  }, [entries.length])

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
