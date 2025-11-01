import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { matchPath, Outlet, useLocation, useNavigate } from "react-router-dom"

import { WorkspaceShell } from "@/components/app/workspace-shell"
import { ManageProjectDialog } from "@/components/app/manage-project-dialog"
import type { ImageAttachment, Project, ThreadListItem } from "@/types/app"
import { DeleteAttachment, SaveClipboardImage, SelectProjectDirectory } from "../../wailsjs/go/main/App"
import {
  getReasoningOptions,
  modelOptions,
  sandboxOptions,
  type SelectOption
} from "@/data/app-data"
import { useWorkspaceController } from "@/hooks/useWorkspaceController"
import { threadToListItem } from "@/lib/threads"
import type { WorkspaceRouteContextValue } from "@/routes/workspace-context"

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
  return null
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") {
        const base64 = result.split(",")[1]
        if (base64) {
          resolve(base64)
          return
        }
      }
      reject(new Error("Invalid image data"))
    }
    reader.onerror = () => {
      reject(new Error("Failed to read file"))
    }
    reader.readAsDataURL(file)
  })
}

export default function WorkspaceLayout() {
  const workspace = useWorkspaceController()
  const navigate = useNavigate()
  const location = useLocation()

  const projectMatch = matchPath("/projects/:projectId/*", location.pathname)
  const threadMatch = matchPath("/projects/:projectId/threads/:threadId", location.pathname)
  const threadIdParamRaw = threadMatch?.params?.threadId ?? null
  const isNewThreadRoute = threadIdParamRaw === "new"
  const threadIdParam =
    threadIdParamRaw && !isNewThreadRoute && !Number.isNaN(Number(threadIdParamRaw))
      ? Number(threadIdParamRaw)
      : null

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
  const lastThreadIdRef = useRef<number | "new" | null>(null)

  useEffect(() => {
    const options = getReasoningOptions(model.value)
    setReasoning((prev) => options.find((option) => option.value === prev.value) ?? options[0])
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
          workspace.stream.setError(message)
        }
      }

      if (newAttachments.length > 0) {
        setImageAttachments((previous) => [...previous, ...newAttachments])
      }
    },
    [workspace.stream]
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
      void workspace.projects.select(project)
      navigate(`/projects/${project.id}`)
    },
    [clearAttachments, navigate, workspace.projects]
  )

  const handleRegisterProject = useCallback(
    async (payload: { path: string; displayName?: string; tags: string[] }) => {
      setIsSubmittingProject(true)
      setDialogError(null)
      try {
        await workspace.projects.register(payload.path, payload.displayName, payload.tags)
        setIsDialogOpen(false)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to register project."
        setDialogError(message)
        throw error
      } finally {
        setIsSubmittingProject(false)
      }
    },
    [workspace.projects]
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
      clearAttachments()
      workspace.threads.select(thread)
      const targetProjectId = thread.projectId || workspace.projects.active?.id
      if (targetProjectId) {
        navigate(`/projects/${targetProjectId}/threads/${thread.id}`)
      }
    },
    [clearAttachments, navigate, workspace.projects.active?.id, workspace.threads]
  )

  const handleNewThread = useCallback(() => {
    workspace.threads.newThread()
    setPrompt("")
    clearAttachments()
    if (workspace.projects.active) {
      navigate(`/projects/${workspace.projects.active.id}/threads/new`)
    }
  }, [clearAttachments, navigate, workspace.projects.active, workspace.threads])

  const handleSendPrompt = useCallback(async () => {
    const trimmed = prompt.trim()
    const hasAttachments = imageAttachments.length > 0
    if (!trimmed && !hasAttachments) {
      return undefined
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
      const threadId = await workspace.stream.send({
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
      return threadId
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to send message"
      workspace.stream.setError(message)
      return undefined
    }
  }, [clearAttachments, imageAttachments, model.value, prompt, reasoning.value, sandbox.value, workspace.stream])

  const projectIdParam = projectMatch?.params?.projectId ? Number(projectMatch.params.projectId) : null

  useEffect(() => {
    if (workspace.projects.isLoading) {
      return
    }
    if (projectIdParam && !Number.isNaN(projectIdParam)) {
      const target = workspace.projects.list.find((project) => project.id === projectIdParam)
      if (target) {
        if (!workspace.projects.active || workspace.projects.active.id !== target.id) {
          void workspace.projects.select(target)
        }
        return
      }
      if (workspace.projects.list.length > 0) {
        navigate("/", { replace: true })
      }
      return
    }
    if (workspace.projects.active) {
      navigate(`/projects/${workspace.projects.active.id}`, { replace: true })
      return
    }
    if (workspace.projects.list.length > 0) {
      const first = workspace.projects.list[0]
      void workspace.projects.select(first)
      navigate(`/projects/${first.id}`, { replace: true })
    }
  }, [
    navigate,
    projectIdParam,
    workspace.projects.active,
    workspace.projects.isLoading,
    workspace.projects.list,
    workspace.projects
  ])

  useEffect(() => {
    if (workspace.projects.isLoading || workspace.threads.isLoading) {
      return
    }
    const activeProject = workspace.projects.active
    if (!activeProject) {
      return
    }

    if (isNewThreadRoute) {
      workspace.threads.newThread()
      return
    }

    if (threadIdParam && !Number.isNaN(threadIdParam)) {
      const target = workspace.threads.list.find((thread) => thread.id === threadIdParam)
      if (target) {
        if (!workspace.threads.active || workspace.threads.active.id !== target.id) {
          workspace.threads.select(threadToListItem(target))
        }
        return
      }
      navigate(`/projects/${activeProject.id}`, { replace: true })
      return
    }

    if (workspace.threads.active && workspace.threads.active.projectId === activeProject.id) {
      navigate(`/projects/${activeProject.id}/threads/${workspace.threads.active.id}`, { replace: true })
    }
  }, [
    isNewThreadRoute,
    navigate,
    threadIdParam,
    workspace.projects.active,
    workspace.projects.isLoading,
    workspace.threads.active,
    workspace.threads.isLoading,
    workspace.threads.list,
    workspace.threads
  ])

  useEffect(() => {
    const currentId = isNewThreadRoute
      ? "new"
      : threadIdParam && !Number.isNaN(threadIdParam)
        ? threadIdParam
        : null
    if (currentId === lastThreadIdRef.current) {
      return
    }
    lastThreadIdRef.current = currentId
    setPrompt("")
    clearAttachments()
  }, [clearAttachments, isNewThreadRoute, threadIdParam])

  const selectModel = useCallback(
    (value: string) => {
      setModel(modelOptions.find((option) => option.value === value) ?? modelOptions[0])
    },
    []
  )

  const selectSandbox = useCallback((value: string) => {
    setSandbox(sandboxOptions.find((option) => option.value === value) ?? sandboxOptions[0])
  }, [])

  const selectReasoning = useCallback(
    (value: string) => {
      setReasoning(
        reasoningOptions.find((option) => option.value === value) ?? reasoningOptions[0]
      )
    },
    [reasoningOptions]
  )

  const sidebarLoading = workspace.projects.isLoading || workspace.threads.isLoading

  const outletContext = useMemo<WorkspaceRouteContextValue>(
    () => ({
      workspace,
      prompt,
      setPrompt,
      imageAttachments,
      onAddImages: handleComposerAddImages,
      onRemoveAttachment: handleRemoveAttachment,
      selectModel,
      selectSandbox,
      selectReasoning,
      model,
      sandbox,
      reasoning,
      reasoningOptions,
      modelOptions,
      sandboxOptions,
      sendPrompt: handleSendPrompt
    }),
    [
      handleComposerAddImages,
      handleRemoveAttachment,
      handleSendPrompt,
      imageAttachments,
      model,
      modelOptions,
      prompt,
      reasoning,
      reasoningOptions,
      sandbox,
      sandboxOptions,
      selectModel,
      selectReasoning,
      selectSandbox,
      workspace
    ]
  )

  return (
    <>
      <WorkspaceShell
        sidebar={{
          projects: workspace.projects.list,
          sections: workspace.threads.sections,
          activeProject: workspace.projects.active,
          onProjectChange: handleProjectChange,
          onProjectDelete: handleDeleteProject,
          onAddProject: () => {
            setDialogError(null)
            setIsDialogOpen(true)
          },
          onNewThread: handleNewThread,
          isLoadingProjects: sidebarLoading,
          activeThread: workspace.threads.active,
          onThreadSelect: handleThreadSelect,
          onThreadRename: workspace.threads.rename,
          onThreadDelete: workspace.threads.remove
        }}
        main={<Outlet context={outletContext} />}
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
