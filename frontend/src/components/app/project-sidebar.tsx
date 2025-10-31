import { useEffect, useState, type FormEvent } from "react"

import { WorkspacePanel } from "@/components/app/workspace-panel"
import { Button } from "@/components/ui/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BadgeCheck, Clock3, Flame, Plus, Rocket } from "lucide-react"

import { cn } from "@/lib/utils"
import type { Project, ThreadListItem, ThreadSection } from "@/types/app"

type ProjectSidebarProps = {
  projects: Project[]
  sections: ThreadSection[]
  activeProject: Project | null
  onProjectChange: (project: Project) => void
  onProjectDelete: (project: Project) => void
  onAddProject: () => void
  onNewThread: () => void
  isLoadingProjects?: boolean
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
}

export function ProjectSidebar({
  projects,
  sections,
  activeProject,
  onProjectChange,
  onProjectDelete,
  onAddProject,
  onNewThread,
  isLoadingProjects,
  activeThread,
  onThreadSelect,
  onThreadRename,
  onThreadDelete
}: ProjectSidebarProps) {
  const totalThreads = sections.reduce((sum, section) => sum + section.threads.length, 0)

  return (
    <aside className="flex flex-col h-full w-full max-w-[288px] border-r border-border/70 bg-white">
      <WorkspacePanel
        title="Projects"
        className="flex h-1/2 flex-col"
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-2"
            onClick={onAddProject}
            disabled={isLoadingProjects}
          >
            <Plus className="h-4 w-4" />
            Add
          </Button>
        }
        bodyClassName="flex h-full min-h-0 flex-col gap-3 px-3 py-3"
      >
        <ProjectList
          projects={projects}
          activeProject={activeProject}
          onSelect={onProjectChange}
          onDelete={onProjectDelete}
        />
        {activeProject && (
          <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <p className="text-sm font-semibold text-foreground">{activeProject.name}</p>
            <p className="mt-1">Tracked threads · {totalThreads}</p>
          </div>
        )}
      </WorkspacePanel>
      <WorkspacePanel
        title="Threads"
        className="flex h-1/2 flex-col"
        actions={
          <Button variant="default" size="sm" className="h-7 rounded-md px-3" onClick={onNewThread}>
            New
          </Button>
        }
        bodyClassName="flex h-full min-h-0 flex-col px-3 py-3"
      >
        {sections.length > 0 && activeProject ? (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="space-y-4">
              {sections.map((section) => (
                <ThreadSectionList
                  key={section.label}
                  section={section}
                  activeThread={activeThread}
                  onThreadSelect={onThreadSelect}
                  onThreadRename={onThreadRename}
                  onThreadDelete={onThreadDelete}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 text-center">
            <p className="text-sm font-medium text-foreground">
              {activeProject ? "No conversations yet" : "Select a project"}
            </p>
            <p className="text-xs text-muted-foreground">
              {activeProject
                ? "Once Codex ingests sessions for this workspace, they’ll show up here."
                : "Pick a project or add a new one to start tracking conversations."}
            </p>
          </div>
        )}
      </WorkspacePanel>
    </aside>
  )
}

type ThreadSectionListProps = {
  section: ThreadSection
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
}

function ThreadSectionList({
  section,
  activeThread,
  onThreadSelect,
  onThreadRename,
  onThreadDelete
}: ThreadSectionListProps) {
  const icon = getSectionIcon(section.label)
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {section.label}
          </p>
          {section.subtitle && (
            <p className="mt-0.5 text-xs text-muted-foreground">{section.subtitle}</p>
          )}
        </div>
        {icon}
      </div>
      <div className="space-y-1.5">
        {section.threads.map((thread) => {
          const isActive = activeThread?.id === thread.id
          return (
            <ThreadListItemRow
              key={thread.id}
              thread={thread}
              isActive={isActive}
              onSelect={onThreadSelect}
              onRename={onThreadRename}
              onDelete={onThreadDelete}
            />
          )
        })}
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: ThreadListItem["status"] }) {
  const colorMap: Record<ThreadListItem["status"], string> = {
    active: "bg-emerald-500",
    completed: "bg-sky-500",
    stopped: "bg-amber-500",
    failed: "bg-rose-500"
  }
  return <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorMap[status] ?? "bg-muted-foreground")}></span>
}

type ThreadListItemRowProps = {
  thread: ThreadListItem
  isActive: boolean
  onSelect: (thread: ThreadListItem) => void
  onRename: (thread: ThreadListItem, title: string) => Promise<void>
  onDelete: (thread: ThreadListItem) => Promise<void>
}

function ThreadListItemRow({ thread, isActive, onSelect, onRename, onDelete }: ThreadListItemRowProps) {
  const detail = thread.relativeTimestamp || thread.timestamp
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(thread.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    if (!isRenameDialogOpen) {
      setRenameValue(thread.title)
      setRenameError(null)
    }
  }, [isRenameDialogOpen, thread.title])

  useEffect(() => {
    if (!isDeleteDialogOpen) {
      setDeleteError(null)
    }
  }, [isDeleteDialogOpen])

  const handleRenameSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = renameValue.trim()
    if (!trimmed) {
      setRenameError("Thread name cannot be empty.")
      return
    }
    setIsRenaming(true)
    try {
      await onRename(thread, trimmed)
      setIsRenameDialogOpen(false)
      setRenameError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to rename thread."
      setRenameError(message)
    } finally {
      setIsRenaming(false)
    }
  }

  const handleDeleteConfirm = async () => {
    setIsDeleting(true)
    try {
      await onDelete(thread)
      setIsDeleteDialogOpen(false)
      setDeleteError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete thread."
      setDeleteError(message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <div className="w-full">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <button
              onClick={() => onSelect(thread)}
              className={cn(
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 overflow-hidden rounded-md border px-3 py-2 text-left transition",
                isActive
                  ? "border-primary/60 bg-primary/[0.08] shadow-sm"
                  : "border-border/60 bg-card hover:bg-muted/70"
              )}
            >
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground">
                <StatusPill status={thread.status} />
                <span className="truncate">{thread.title}</span>
              </div>
              <div className="min-w-0 justify-self-end text-[10px] text-muted-foreground">
                {detail && <span className="truncate whitespace-nowrap">{detail}</span>}
              </div>
            </button>
          </ContextMenuTrigger>
          <ContextMenuContent className="w-44">
            <ContextMenuItem
              onSelect={(event) => {
                event.preventDefault()
                setIsRenameDialogOpen(true)
              }}
            >
              Rename
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              onSelect={(event) => {
                event.preventDefault()
                setIsDeleteDialogOpen(true)
              }}
            >
              Delete
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      </div>

      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename thread</DialogTitle>
            <DialogDescription>Give the thread a more descriptive name.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-3">
            <Input value={renameValue} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
            {renameError && <p className="text-sm text-destructive">{renameError}</p>}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsRenameDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isRenaming}>
                {isRenaming ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete thread</DialogTitle>
            <DialogDescription>Deleting a thread cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function getSectionIcon(label: string) {
  switch (label.toLowerCase()) {
    case "in progress":
      return <Rocket className="h-4 w-4 text-primary" />
    case "archived":
      return <Clock3 className="h-4 w-4 text-muted-foreground" />
    case "older":
      return <BadgeCheck className="h-4 w-4 text-emerald-500" />
    default:
      return <Flame className="h-4 w-4 text-amber-500" />
  }
}

type ProjectListProps = {
  projects: Project[]
  activeProject: Project | null
  onSelect: (project: Project) => void
  onDelete: (project: Project) => void
}

function ProjectList({ projects, activeProject, onSelect, onDelete }: ProjectListProps) {
  if (projects.length === 0) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border/60 bg-muted/40 px-3 text-center text-xs text-muted-foreground">
        Add a project to get started.
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
      <div className="space-y-1.5">
        {projects.map((project) => (
          <ProjectListItemRow
            key={project.id}
            project={project}
            isActive={activeProject?.id === project.id}
            onSelect={onSelect}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

type ProjectListItemRowProps = {
  project: Project
  isActive: boolean
  onSelect: (project: Project) => void
  onDelete: (project: Project) => void
}

function ProjectListItemRow({ project, isActive, onSelect, onDelete }: ProjectListItemRowProps) {
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleDelete = async () => {
    setIsDeleting(true)
    try {
      await onDelete(project)
      setIsDeleteDialogOpen(false)
      setDeleteError(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete project."
      setDeleteError(message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => onSelect(project)}
            className={cn(
              "w-full rounded-md border px-3 py-2 text-left transition",
              isActive
                ? "border-primary/60 bg-primary/[0.08] shadow-sm"
                : "border-border/60 bg-card hover:bg-muted/70"
            )}
          >
            <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{project.path}</p>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-40">
          <ContextMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={(event) => {
              event.preventDefault()
              setIsDeleteDialogOpen(true)
            }}
          >
            Delete project
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove project</DialogTitle>
            <DialogDescription>
              This will remove {project.name} from your workspace list. The project files will not be deleted.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setIsDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
