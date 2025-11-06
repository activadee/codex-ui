import { useCallback, useEffect, useMemo } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { ConversationPane } from "@/components/app/conversation-pane"
import { ComposerPanel } from "@/components/app/composer-panel"
import { WorkspaceAlerts } from "@/components/app/workspace-alerts"
import { useWorkspaceRouteContext } from "@/routes/workspace-context"

export default function NewThreadRoute() {
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
  const navigate = useNavigate()
  const params = useParams()

  useEffect(() => {
    workspace.threads.newThread()
    workspace.stream.setError(null)
  }, [workspace])

  const alerts = useMemo(() => {
    const items: { id: string; message: string; tone?: "info" | "error" }[] = []
    if (workspace.projects.isLoading || workspace.threads.isLoading) {
      items.push({ id: "loading", message: "Loading workspace…", tone: "info" })
    }
    if (workspace.projects.error) {
      items.push({ id: "projects-error", message: workspace.projects.error, tone: "error" })
    }
    if (workspace.threads.error) {
      items.push({ id: "threads-error", message: workspace.threads.error, tone: "error" })
    }
    return items
  }, [workspace.projects.error, workspace.projects.isLoading, workspace.threads.error, workspace.threads.isLoading])

  const hasDraftContent = prompt.trim().length > 0 || imageAttachments.length > 0
  const canSend = Boolean(hasDraftContent && workspace.projects.active && !workspace.stream.isStreaming)

  const handleSend = useCallback(async () => {
    const threadId = await sendPrompt()
    if (threadId && params.projectId) {
      navigate(`/projects/${params.projectId}/threads/${threadId}`, { replace: true })
    }
  }, [navigate, params.projectId, sendPrompt])

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {alerts.length > 0 && (
        <div className="mb-4 flex flex-col gap-3">
          <WorkspaceAlerts alerts={alerts} />
        </div>
      )}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
        <div className="flex flex-1 min-h-0 flex-col overflow-hidden">
          <ConversationPane
            projectName={workspace.projects.active?.name ?? "Workspace"}
            thread={null}
            entries={[]}
            hasMore={false}
            isLoading={false}
            isFetchingMore={false}
            onLoadOlder={() => {}}
            isStreaming={workspace.stream.isStreaming}
            streamStatus={workspace.stream.status}
          />
          <div className="border-t border-border/70 bg-white">
            <ComposerPanel
              projectName={workspace.projects.active?.name ?? "Workspace"}
              prompt={prompt}
              onPromptChange={setPrompt}
              attachments={imageAttachments}
              onAddImages={onAddImages}
              onRemoveAttachment={onRemoveAttachment}
              onSend={() => {
                void handleSend()
              }}
              onStop={workspace.stream.cancel}
              canSend={canSend}
              isStreaming={workspace.stream.isStreaming}
              model={model}
              reasoning={reasoning}
              sandbox={sandbox}
              modelOptions={modelOptions}
              reasoningOptions={reasoningOptions}
              sandboxOptions={sandboxOptions}
              onModelChange={selectModel}
              onReasoningChange={selectReasoning}
              onSandboxChange={selectSandbox}
              usage={workspace.stream.usage}
              status={workspace.stream.status}
              errorMessage={workspace.stream.error}
              todoList={null}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
