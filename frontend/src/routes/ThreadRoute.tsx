import { ConversationPane } from "@/components/app/conversation-pane"
import { ComposerPanel } from "@/components/app/composer-panel"
import { WorkspaceAlerts } from "@/components/app/workspace-alerts"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { FilesPanel } from "@/components/app/files-panel"
import { ThreadTerminal } from "@/components/app/thread-terminal"
import { useWorkspaceRouteContext } from "@/routes/workspace-context"
import type { ConversationEntry } from "@/types/app"

export default function ThreadRoute() {
  const {
    workspace,
    prompt,
    setPrompt,
    imageAttachments,
    onAddImages,
    onRemoveAttachment,
    selectModel,
    selectSandbox,
    selectReasoning,
    model,
    sandbox,
    reasoning,
    reasoningOptions,
    modelOptions,
    sandboxOptions,
    sendPrompt
  } = useWorkspaceRouteContext()

  const { projects, threads, conversation, stream, selection } = workspace

  if (!projects.active || !selection.thread) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading conversation…
      </div>
    )
  }

  const alerts: { id: string; message: string; tone?: "info" | "error" }[] = []
  if (projects.isLoading || threads.isLoading) {
    alerts.push({ id: "loading", message: "Loading workspace…", tone: "info" })
  }
  if (projects.error) {
    alerts.push({ id: "projects-error", message: projects.error, tone: "error" })
  }
  if (threads.error) {
    alerts.push({ id: "threads-error", message: threads.error, tone: "error" })
  }

  const hasDraftContent = prompt.trim().length > 0 || imageAttachments.length > 0
  const canSend = Boolean(hasDraftContent && projects.active && !stream.isStreaming)

  const latestTodoList = getLatestTodoList(conversation.list)

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {alerts.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          <WorkspaceAlerts alerts={alerts} />
        </div>
      )}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="flex h-full min-h-0 w-full">
          <ResizablePanel defaultSize={70} minSize={40} className="min-w-0 min-h-0">
            <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
              <ConversationPane
                projectName={projects.active.name}
                thread={selection.thread}
                entries={conversation.list}
                hasMore={conversation.hasMore}
                isLoading={conversation.isFetching}
                isFetchingMore={conversation.isFetchingMore}
                onLoadOlder={() => conversation.fetchOlder?.()}
                isStreaming={stream.isStreaming}
                streamStatus={stream.status}
              />
              <div className="border-t border-border/70 bg-white">
                <ComposerPanel
                  projectName={projects.active.name}
                  prompt={prompt}
                  onPromptChange={setPrompt}
                  attachments={imageAttachments}
                  onAddImages={onAddImages}
                  onRemoveAttachment={onRemoveAttachment}
                  onSend={() => {
                    void sendPrompt()
                  }}
                  onStop={stream.cancel}
                  canSend={canSend}
                  isStreaming={stream.isStreaming}
                  model={model}
                  reasoning={reasoning}
                  sandbox={sandbox}
                  modelOptions={modelOptions}
                  reasoningOptions={reasoningOptions}
                  sandboxOptions={sandboxOptions}
                  onModelChange={selectModel}
                  onReasoningChange={selectReasoning}
                  onSandboxChange={selectSandbox}
                  usage={stream.usage}
                  status={stream.status}
                  errorMessage={stream.error}
                  todoList={latestTodoList}
                />
              </div>
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={30} minSize={25} className="min-w-[300px] max-w-[520px] min-h-0">
            <ResizablePanelGroup direction="vertical" className="flex h-full min-h-0 w-full flex-col">
              <ResizablePanel defaultSize={50} minSize={30} className="min-h-0">
                <div className="flex h-full min-h-0 flex-col">
                  <FilesPanel threadId={selection.thread?.id} />
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle />
              <ResizablePanel defaultSize={50} minSize={30} className="min-h-0">
                <div className="flex h-full min-h-0 flex-col">
                  <ThreadTerminal threadId={selection.thread?.id} />
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  )
}

function getLatestTodoList(conversationEntries: ConversationEntry[]) {
  for (let index = conversationEntries.length - 1; index >= 0; index -= 1) {
    const entry = conversationEntries[index]
    if (entry.role === "agent" && entry.item?.type === "todo_list") {
      const items = entry.item.todoList?.items ?? []
      return { items }
    }
  }
  return null
}
