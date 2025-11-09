import { useMemo } from "react"

import type { WorkspaceRouteContextValue } from "@/routes/workspace-context"

export function useWorkspaceComposer({
  workspace,
  prompt,
  setPrompt,
  imageAttachments,
  onAddImages,
  onRemoveAttachment,
  clearAttachments,
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
}: WorkspaceRouteContextValue & {
  clearAttachments: (options?: { deleteFiles?: boolean }) => void
}) {
  const composerProps = useMemo(
    () => ({
      projectName: workspace.projects.active?.name ?? "Workspace",
      prompt,
      onPromptChange: setPrompt,
      attachments: imageAttachments,
      onAddImages,
      onRemoveAttachment,
      onSend: async () => {
        const threadId = await sendPrompt()
        return threadId
      },
      onStop: workspace.stream.cancel,
      canSend: Boolean(
        (prompt.trim().length > 0 || imageAttachments.length > 0) && workspace.projects.active && !workspace.stream.isStreaming
      ),
      isStreaming: workspace.stream.isStreaming,
      model,
      reasoning,
      sandbox,
      modelOptions,
      reasoningOptions,
      sandboxOptions,
      onModelChange: selectModel,
      onReasoningChange: selectReasoning,
      onSandboxChange: selectSandbox,
      usage: workspace.stream.usage,
      status: workspace.stream.status,
      errorMessage: workspace.stream.error
    }),
    [
      imageAttachments,
      model,
      modelOptions,
      onAddImages,
      onRemoveAttachment,
      prompt,
      reasoning,
      reasoningOptions,
      sandbox,
      sandboxOptions,
      selectModel,
      selectReasoning,
      selectSandbox,
      sendPrompt,
      setPrompt,
      workspace
    ]
  )

  return {
    composerProps,
    clearAttachments
  }
}
