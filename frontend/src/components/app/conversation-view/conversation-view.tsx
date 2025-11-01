import { Sparkles } from "lucide-react"

import type { ConversationEntry } from "@/types/app"

import { ConversationEntryCard } from "./conversation-entry-card"
import { StreamingIndicator } from "./streaming-indicator"

export type ConversationViewProps = {
  entries: ConversationEntry[]
  isStreaming: boolean
  streamStatus: string
  projectName: string
}

export function ConversationView({ entries, isStreaming, streamStatus, projectName }: ConversationViewProps) {
  const hasContent = entries.length > 0

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
          <div className="min-w-0 flex-1 overflow-y-auto px-4 pb-6 pt-1 md:px-6 md:pb-8 md:pt-2">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-3">
              {entries.map((entry) => (
                <ConversationEntryCard key={entry.id} entry={entry} />
              ))}
              {isStreaming && <StreamingIndicator status={streamStatus} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
