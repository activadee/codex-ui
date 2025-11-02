import { useCallback, useEffect, useMemo } from "react"
import { Outlet, useNavigate } from "react-router-dom"

import { WorkspaceShell } from "@/components/app/workspace-shell"
import { ManageProjectDialog } from "@/components/app/manage-project-dialog"
import type { Project, ThreadListItem, UserMessageSegment } from "@/types/app"
import { useWorkspaceController } from "@/hooks/useWorkspaceController"
import { useComposerState } from "@/routes/hooks/useComposerState"
import { useWorkspaceDialogs } from "@/routes/hooks/useWorkspaceDialogs"
import { useWorkspaceRouting } from "@/routes/hooks/useWorkspaceRouting"
import type { WorkspaceRouteContextValue } from "@/routes/workspace-context"

export default function WorkspaceLayout() {
  const workspace = useWorkspaceController()
  const navigate = useNavigate()

  const composer = useComposerState(workspace.stream)
  const dialogs = useWorkspaceDialogs()

  const resetComposer = useCallback(() => {
    composer.setPrompt("")
    composer.clearAttachments()
  }, [composer])

  const routing = useWorkspaceRouting(workspace, resetComposer)

  const handleProjectChange = useCallback(
    (project: Project) => {
      resetComposer()
      void workspace.projects.select(project)
      navigate(`/projects/${project.id}`)
    },
    [navigate, resetComposer, workspace.projects]
  )

  const handleRegisterProject = useCallback(
    async (payload: { path: string; displayName?: string; tags: string[] }) => {
      dialogs.setIsSubmittingProject(true)
      dialogs.setDialogError(null)
      try {
        await workspace.projects.register(payload.path, payload.displayName, payload.tags)
        dialogs.closeDialog()
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to register project."
        dialogs.setDialogError(message)
        throw error
      } finally {
        dialogs.setIsSubmittingProject(false)
      }
    },
    [dialogs, workspace.projects]
  )

  const handleDeleteProject = useCallback(
    async (projectToDelete: Project) => {
      const confirmed = window.confirm(
        `Remove “${projectToDelete.name}” from your catalog?\nThis will not delete files on disk.`
      )
      if (!confirmed) {
        return
      }
      try {
        await workspace.projects.remove(projectToDelete.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete project."
        window.alert(message)
      }
    },
    [workspace.projects]
  )

  const handleThreadSelect = useCallback(
    (thread: ThreadListItem) => {
      routing.handleThreadSelect(thread)
    },
    [routing]
  )

  const handleNewThread = useCallback(() => {
    routing.handleNewThreadRoute()
  }, [routing])

  const handleSendPrompt = useCallback(async () => {
    const trimmed = composer.prompt.trim()
    const hasAttachments = composer.imageAttachments.length > 0
    if (!trimmed && !hasAttachments) {
      return undefined
    }

    const segments: Array<UserMessageSegment> = []
    if (hasAttachments) {
      for (const attachment of composer.imageAttachments) {
        segments.push({ type: "image", imagePath: attachment.path })
      }
    }
    if (trimmed) {
      segments.push({ type: "text", text: trimmed })
    }

    const attachmentPaths = hasAttachments
      ? composer.imageAttachments.map((attachment) => attachment.path)
      : []

    const threadId = await workspace.stream.send({
      content: trimmed,
      model: composer.model.value,
      sandbox: composer.sandbox.value,
      reasoning: composer.reasoning.value,
      segments: segments.length > 0 ? segments : undefined,
      attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined
    })

    composer.setPrompt("")
    if (hasAttachments) {
      composer.clearAttachments({ deleteFiles: false })
    }
    return threadId
  }, [composer, workspace.stream])

  const sidebarProps = useMemo(
    () => ({
      projects: workspace.projects.list,
      sections: workspace.threads.sections,
      activeProject: workspace.projects.active,
      onProjectChange: handleProjectChange,
      onProjectDelete: handleDeleteProject,
      onAddProject: dialogs.openDialog,
      onNewThread: handleNewThread,
      isLoadingProjects: routing.sidebarLoading,
      activeThread: workspace.threads.active,
      onThreadSelect: handleThreadSelect,
      onThreadRename: workspace.threads.rename,
      onThreadDelete: workspace.threads.remove
    }),
    [
      dialogs.openDialog,
      handleDeleteProject,
      handleNewThread,
      handleProjectChange,
      handleThreadSelect,
      routing.sidebarLoading,
      workspace.projects.active,
      workspace.projects.list,
      workspace.threads.active,
      workspace.threads.remove,
      workspace.threads.rename,
      workspace.threads.sections
    ]
  )

  const outletContext: WorkspaceRouteContextValue = {
    workspace,
    prompt: composer.prompt,
    setPrompt: composer.setPrompt,
    imageAttachments: composer.imageAttachments,
    onAddImages: composer.addImages,
    onRemoveAttachment: composer.removeAttachment,
    selectModel: composer.setModelValue,
    selectSandbox: composer.setSandboxValue,
    selectReasoning: composer.setReasoningValue,
    model: composer.model,
    sandbox: composer.sandbox,
    reasoning: composer.reasoning,
    reasoningOptions: composer.reasoningOptions,
    modelOptions: composer.modelOptions,
    sandboxOptions: composer.sandboxOptions,
    sendPrompt: handleSendPrompt
  }

  // Sync composer selections to the active thread's saved options
  useEffect(() => {
    const thread = workspace.selection.thread
    if (!thread) return
    if (thread.model && thread.model !== composer.model.value) {
      composer.setModelValue(thread.model)
    }
    if (thread.sandboxMode && thread.sandboxMode !== composer.sandbox.value) {
      composer.setSandboxValue(thread.sandboxMode)
    }
  }, [
    workspace.selection.thread,
    composer.model.value,
    composer.sandbox.value,
    composer.setModelValue,
    composer.setSandboxValue
  ])

  useEffect(() => {
    const thread = workspace.selection.thread
    if (!thread || !thread.reasoningLevel) return
    if (thread.model && thread.model !== composer.model.value) {
      return
    }
    composer.setReasoningValue(thread.reasoningLevel)
  }, [workspace.selection.thread, composer.model.value, composer.reasoningOptions, composer.setReasoningValue])

  return (
    <>
      <WorkspaceShell sidebar={sidebarProps} main={<Outlet context={outletContext} />} />

      <ManageProjectDialog
        open={dialogs.isDialogOpen}
        onOpenChange={(open) => (open ? dialogs.openDialog() : dialogs.closeDialog())}
        isSubmitting={dialogs.isSubmittingProject}
        errorMessage={dialogs.dialogError}
        onSubmit={handleRegisterProject}
        onBrowseForDirectory={dialogs.handleChooseDirectory}
      />
    </>
  )
}
