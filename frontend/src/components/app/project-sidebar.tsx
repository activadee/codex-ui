import { useEffect, useState, type FormEvent } from "react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
  isLoadingProjects?: boolean
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onNewThread: () => void
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
  return (
    <aside className="flex h-screen w-full max-w-[320px] flex-col border-r border-border bg-white">
      <div className="flex flex-col gap-3 px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">Agents</span>
          <Button variant="default" size="sm" onClick={onNewThread}>
            + New Agent
          </Button>
        </div>
        <ProjectPicker
          projects={projects}
          activeProject={activeProject}
          onChange={onProjectChange}
        />
      </div>
      <ScrollArea className="flex-1 px-4 py-6">
        {sections.length > 0 && activeProject ? (
          <div className="space-y-8">
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
        ) : (
          <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/80 bg-muted/40 text-center">
            <p className="text-sm font-medium text-foreground">
              {activeProject ? "No conversations yet" : "Select a project"}
            </p>
            <p className="max-w-[220px] text-xs text-muted-foreground">
              {activeProject
                ? "Once Codex ingests sessions for this workspace, they’ll show up here."
                : "Pick a project from the menu or add a new one to start tracking conversations."}
            </p>
          </div>
        )}
      </ScrollArea>
      <div className="border-t border-border p-4">
        <Button
          variant="outline"
          className="w-full justify-center gap-2 rounded-2xl"
          onClick={onAddProject}
          disabled={isLoadingProjects}
        >
          <Plus className="h-4 w-4" />
          Add project
        </Button>
      </div>
    </aside>
  )
}

type ProjectPickerProps = {
  activeProject: Project | null
  projects: Project[]
  onChange: (project: Project) => void
}

function ProjectPicker({ activeProject, projects, onChange }: ProjectPickerProps) {
  const hasProjects = projects.length > 0
  const placeholder = hasProjects ? "Select project" : "No projects available"
  return (
    <Select
      value={activeProject ? String(activeProject.id) : undefined}
      onValueChange={(value) => {
        const selected = projects.find((project) => String(project.id) === value)
        if (selected) {
          onChange(selected)
        }
      }}
      disabled={!hasProjects}
    >
      <SelectTrigger className="border border-border bg-white px-3 py-2 text-left text-sm text-foreground">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {projects.map((project) => (
          <SelectItem key={project.id} value={String(project.id)}>
            {project.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">
            {section.label}
          </p>
          {section.subtitle && (
            <p className="mt-1 text-xs text-muted-foreground">{section.subtitle}</p>
          )}
        </div>
        {icon}
      </div>
      <div className="space-y-2">
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
                "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-lg px-3 py-2.5 text-left transition",
                isActive
                  ? "border-primary/60 bg-primary/[0.08] shadow-sm"
                  : "border-border/60 bg-card hover:border-border hover:bg-muted/70"
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
            <DialogDescription>Choose a new name to help you recognize this conversation.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameSubmit} className="space-y-4">
            <Input
              autoFocus
              value={renameValue}
              onChange={(event) => setRenameValue(event.target.value)}
              placeholder="Thread name"
            />
            {renameError && <p className="text-xs text-destructive">{renameError}</p>}
            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setIsRenameDialogOpen(false)} disabled={isRenaming}>
                Cancel
              </Button>
              <Button type="submit" disabled={isRenaming}>
                {isRenaming ? "Saving..." : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete thread</DialogTitle>
            <DialogDescription>
              This will remove the conversation and its history. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteError && <p className="text-xs text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteConfirm} disabled={isDeleting}>
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function getSectionIcon(label: string) {
  switch (label) {
    case "IN PROGRESS":
      return <Rocket className="h-4 w-4 text-muted-foreground" />
    case "OLDER":
      return <Clock3 className="h-4 w-4 text-muted-foreground" />
    case "ARCHIVED":
      return <BadgeCheck className="h-4 w-4 text-muted-foreground" />
    default:
      return <Flame className="h-4 w-4 text-muted-foreground" />
  }
}
