import { ConversationHeader } from "@/components/app/conversation-header"
import { ConversationView } from "@/components/app/conversation-view"
import type { AgentThread, ConversationEntry } from "@/types/app"

type ConversationPaneProps = {
  projectName: string
  thread: AgentThread | null
  entries: ConversationEntry[]
  isStreaming: boolean
  streamStatus: string
}

export function ConversationPane({
  projectName,
  thread,
  entries,
  isStreaming,
  streamStatus
}: ConversationPaneProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ConversationHeader
        thread={thread}
        projectName={projectName}
      />
      <div className="flex flex-1 overflow-hidden">
        <ConversationView
          projectName={projectName}
          entries={entries}
          isStreaming={isStreaming}
          streamStatus={streamStatus}
        />
      </div>
    </div>
  )
}
