import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { WorkspaceShell } from "@/components/app/workspace-shell"
import { WorkspaceAlerts } from "@/components/app/workspace-alerts"
import { ConversationPane } from "@/components/app/conversation-pane"
import { ComposerPanel } from "@/components/app/composer-panel"
import { FilesPanel } from "@/components/app/files-panel"
import { ThreadTerminal } from "@/components/app/thread-terminal"
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ManageProjectDialog } from "@/components/app/manage-project-dialog"
import {
  getReasoningOptions,
  modelOptions,
  sandboxOptions,
  type SelectOption
} from "@/data/app-data"
import { useWorkspaceController } from "@/hooks/useWorkspaceController"
import type { ImageAttachment, Project, ThreadListItem } from "@/types/app"
import { DeleteAttachment, SaveClipboardImage, SelectProjectDirectory } from "../wailsjs/go/main/App"

function App() {
  const { projects, threads, conversation, stream, selection } = useWorkspaceController()

  const [prompt, setPrompt] = useState("")
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [isSubmittingProject, setIsSubmittingProject] = useState(false)

  const [model, setModel] = useState<SelectOption>(modelOptions[0])
  const [sandbox, setSandbox] = useState<SelectOption>(sandboxOptions[0])
  const reasoningOptions = useMemo(() => getReasoningOptions(model.value), [model.value])
  const [reasoning, setReasoning] = useState<SelectOption>(reasoningOptions[0])
  const [imageAttachments, setImageAttachments] = useState<ImageAttachment[]>([])
  const attachmentsRef = useRef<ImageAttachment[]>([])

  useEffect(() => {
    const available = getReasoningOptions(model.value)
    setReasoning((prev) => available.find((option) => option.value === prev.value) ?? available[0])
  }, [model])

  const releaseAttachmentUrl = useCallback((attachment: ImageAttachment) => {
    URL.revokeObjectURL(attachment.previewUrl)
  }, [])

  const disposeAttachment = useCallback(
    (attachment: ImageAttachment, deleteFile: boolean) => {
      releaseAttachmentUrl(attachment)
      if (deleteFile) {
        void DeleteAttachment(attachment.path).catch((error) => {
          console.error("Failed to delete attachment", error)
        })
      }
    },
    [releaseAttachmentUrl]
  )

  useEffect(() => {
    attachmentsRef.current = imageAttachments
  }, [imageAttachments])

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => disposeAttachment(attachment, true))
    }
  }, [disposeAttachment])

  const clearAttachments = useCallback(
    (options?: { deleteFiles?: boolean }) => {
      const deleteFiles = options?.deleteFiles ?? true
      setImageAttachments((previous) => {
        if (previous.length === 0) {
          return previous
        }
        previous.forEach((attachment) => disposeAttachment(attachment, deleteFiles))
        return []
      })
    },
    [disposeAttachment]
  )

  const handleRemoveAttachment = useCallback(
    (attachmentId: string) => {
      setImageAttachments((previous) => {
        const target = previous.find((attachment) => attachment.id === attachmentId)
        if (!target) {
          return previous
        }
        disposeAttachment(target, true)
        return previous.filter((attachment) => attachment.id !== attachmentId)
      })
    },
    [disposeAttachment]
  )

  const handleAddImages = useCallback(
    async (files: File[]) => {
      const entries = files
        .map((file) => {
          const mimeType = inferImageMimeType(file)
          return mimeType ? { file, mimeType } : null
        })
        .filter((entry): entry is { file: File; mimeType: string } => entry !== null)

      if (entries.length === 0) {
        return
      }

      const newAttachments: ImageAttachment[] = []
      for (const { file, mimeType } of entries) {
        try {
          const base64 = await readFileAsBase64(file)
          const storedPath = await SaveClipboardImage(base64, mimeType)
          const previewUrl = URL.createObjectURL(file)
          newAttachments.push({
            id: createAttachmentId(),
            path: storedPath,
            previewUrl,
            mimeType,
            size: file.size,
            name: file.name || "Pasted image"
          })
        } catch (error) {
          console.error("Failed to save pasted image", error)
          const message = error instanceof Error ? error.message : "Failed to attach image"
          stream.setError(message)
        }
      }

      if (newAttachments.length > 0) {
        setImageAttachments((previous) => [...previous, ...newAttachments])
      }
    },
    [stream]
  )

  const handleComposerAddImages = useCallback(
    (files: File[]) => {
      void handleAddImages(files)
    },
    [handleAddImages]
  )

  const handleProjectChange = useCallback(
    (project: Project) => {
      clearAttachments()
      void projects.select(project)
    },
    [clearAttachments, projects]
  )

  const handleRegisterProject = useCallback(
    async (payload: { path: string; displayName?: string; tags: string[] }) => {
      setIsSubmittingProject(true)
      setDialogError(null)
      try {
        await projects.register(payload.path, payload.displayName, payload.tags)
        setIsDialogOpen(false)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to register project."
        setDialogError(message)
        throw error
      } finally {
        setIsSubmittingProject(false)
      }
    },
    [projects]
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
        await projects.remove(projectToDelete.id)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete project."
        window.alert(message)
      }
    },
    [projects]
  )

  const handleChooseDirectory = useCallback(async (currentPath: string) => {
    try {
      return await SelectProjectDirectory(currentPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open project picker."
      setDialogError(message)
      throw error
    }
  }, [])

  const handleThreadSelect = useCallback(
    (thread: ThreadListItem) => {
      threads.select(thread)
      clearAttachments()
    },
    [clearAttachments, threads]
  )

  const handleNewThread = useCallback(() => {
    threads.newThread()
    setPrompt("")
    clearAttachments()
  }, [clearAttachments, threads])

  const handleSendPrompt = useCallback(async () => {
    const trimmed = prompt.trim()
    const hasAttachments = imageAttachments.length > 0
    if (!trimmed && !hasAttachments) {
      return
    }

    const segments: Array<{ type: "text"; text: string } | { type: "image"; imagePath: string }> = []
    if (hasAttachments) {
      if (trimmed) {
        segments.push({ type: "text", text: trimmed })
      }
      for (const attachment of imageAttachments) {
        segments.push({ type: "image", imagePath: attachment.path })
      }
    }

    const attachmentPaths = hasAttachments ? imageAttachments.map((attachment) => attachment.path) : []

    try {
      await stream.send({
        content: trimmed,
        model: model.value,
        sandbox: sandbox.value,
        reasoning: reasoning.value,
        segments: segments.length > 0 ? segments : undefined,
        attachmentPaths: attachmentPaths.length > 0 ? attachmentPaths : undefined
      })
      setPrompt("")
      if (hasAttachments) {
        clearAttachments({ deleteFiles: false })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message"
      stream.setError(message)
    }
  }, [clearAttachments, imageAttachments, model.value, prompt, reasoning.value, sandbox.value, stream])

  const hasDraftContent = prompt.trim().length > 0 || imageAttachments.length > 0
  const canSend = Boolean(hasDraftContent && projects.active && !stream.isStreaming)

  const alerts = useMemo(() => {
    const items: { id: string; message: string; tone?: "info" | "error" }[] = []
    if (projects.isLoading || threads.isLoading) {
      items.push({ id: "loading", message: "Loading workspace…", tone: "info" })
    }
    if (projects.error) {
      items.push({ id: "projects-error", message: projects.error, tone: "error" })
    }
    if (threads.error) {
      items.push({ id: "threads-error", message: threads.error, tone: "error" })
    }
    return items
  }, [projects.error, projects.isLoading, threads.error, threads.isLoading])

  const mainContent = useMemo(() => {
    if (!projects.active) {
      return (
        <div className="flex h-full w-full flex-col items-center justify-center px-8 py-12 text-center text-sm text-muted-foreground">
          <div className=" bg-card px-6 py-8 shadow-sm">
            <p className="font-medium text-foreground">Select a project to get started.</p>
            <p className="mt-2 text-muted-foreground">
              Choose a workspace from the sidebar to view conversations and send messages.
            </p>
          </div>
        </div>
      )
    }

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
                  isStreaming={stream.isStreaming}
                  streamStatus={stream.status}
                />
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
  }, [alerts, conversation.list, projects.active, selection.thread, stream.isStreaming, stream.status])

  // derive the latest todo list from conversation entries
  const latestTodoList = useMemo(() => {
    for (let index = conversation.list.length - 1; index >= 0; index -= 1) {
      const entry = conversation.list[index]
      if (entry.role === "agent" && entry.item?.type === "todo_list") {
        const items = entry.item.todoList?.items ?? []
        return { items }
      }
    }
    return null
  }, [conversation.list])

  return (
    <>
      <WorkspaceShell
        sidebar={{
          projects: projects.list,
          sections: threads.sections,
          activeProject: projects.active,
          onProjectChange: handleProjectChange,
          onProjectDelete: handleDeleteProject,
          onAddProject: () => {
            setDialogError(null)
            setIsDialogOpen(true)
          },
          onNewThread: handleNewThread,
          isLoadingProjects: projects.isLoading || threads.isLoading,
          activeThread: threads.active,
          onThreadSelect: handleThreadSelect,
          onThreadRename: threads.rename,
          onThreadDelete: threads.remove
        }}
        main={mainContent}
        footer={
          <ComposerPanel
            projectName={projects.active?.name ?? "Workspace"}
            prompt={prompt}
            onPromptChange={setPrompt}
            attachments={imageAttachments}
            onAddImages={handleComposerAddImages}
            onRemoveAttachment={handleRemoveAttachment}
            onSend={handleSendPrompt}
            onStop={stream.cancel}
            canSend={canSend}
            isStreaming={stream.isStreaming}
            model={model}
            reasoning={reasoning}
            sandbox={sandbox}
            modelOptions={modelOptions}
            reasoningOptions={reasoningOptions}
            sandboxOptions={sandboxOptions}
            onModelChange={(value) =>
              setModel(modelOptions.find((option) => option.value === value) ?? modelOptions[0])
            }
            onReasoningChange={(value) =>
              setReasoning(
                reasoningOptions.find((option) => option.value === value) ?? reasoningOptions[0]
              )
            }
          onSandboxChange={(value) =>
            setSandbox(sandboxOptions.find((option) => option.value === value) ?? sandboxOptions[0])
          }
          usage={stream.usage}
          status={stream.status}
          errorMessage={stream.error}
          todoList={latestTodoList}
          />
        }
      />

      <ManageProjectDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        isSubmitting={isSubmittingProject}
        errorMessage={dialogError}
        onSubmit={handleRegisterProject}
        onBrowseForDirectory={handleChooseDirectory}
      />
    </>
  )
}

export default App

function createAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function inferImageMimeType(file: File): string | null {
  if (file.type) {
    if (file.type.startsWith("image/")) {
      return file.type
    }
    if (file.type === "application/octet-stream" && file.size > 0) {
      return "image/png"
    }
    return null
  }

  const name = (file.name || "").toLowerCase()
  if (name.endsWith(".png")) {
    return "image/png"
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (name.endsWith(".gif")) {
    return "image/gif"
  }
  if (name.endsWith(".webp")) {
    return "image/webp"
  }
  if (name.endsWith(".bmp")) {
    return "image/bmp"
  }
  if (name.endsWith(".svg")) {
    return "image/svg+xml"
  }
  if (file.size > 0) {
    return "image/png"
  }
  return null
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Unexpected file reader result"))
        return
      }
      const [, base64 = ""] = result.split(",", 2)
      if (!base64) {
        reject(new Error("Unable to read image data from clipboard"))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => {
      reject(reader.error ?? new Error("Failed to read clipboard image"))
    }
    reader.readAsDataURL(file)
  })
}
