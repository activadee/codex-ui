import { ConversationHeader } from "@/components/app/conversation-header"
import { WorkspacePanel } from "@/components/app/workspace-panel"
import { ConversationView } from "@/components/app/conversation-view"
import type { AgentThread, ConversationEntry } from "@/types/app"

type ConversationPaneProps = {
  projectName: string
  thread: AgentThread | null
  entries: ConversationEntry[]
  hasMore: boolean
  isLoading: boolean
  isFetchingMore: boolean
  onLoadOlder?: () => Promise<unknown> | void
  threadId?: number | null
  isStreaming: boolean
  streamStatus: string
}

export function ConversationPane({
  projectName,
  thread,
  entries,
  hasMore,
  isLoading,
  isFetchingMore,
  onLoadOlder,
  threadId,
  isStreaming,
  streamStatus
}: ConversationPaneProps) {
  return (
    <WorkspacePanel
      title={thread?.title ?? "Conversation"}
      bodyClassName="flex h-full min-h-0"
      actions={
        <ConversationHeader
          thread={thread}
          projectName={projectName}
        />
      }
      className="min-h-0"
    >
      <ConversationView
        projectName={projectName}
        entries={entries}
        hasMore={hasMore}
        isLoading={isLoading}
        isFetchingMore={isFetchingMore}
        onLoadOlder={onLoadOlder}
        isStreaming={isStreaming}
        streamStatus={streamStatus}
        threadId={threadId}
      />
    </WorkspacePanel>
  )
}
