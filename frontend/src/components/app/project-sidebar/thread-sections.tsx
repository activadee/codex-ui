import { useState } from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { BadgeCheck, Clock3, Flame, Rocket } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ThreadListItem, ThreadSection } from "@/types/app"

export type ThreadSectionsProps = {
  sections: ThreadSection[]
  activeProject: { id: number } | null
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
}

export function ThreadSections({
  sections,
  activeProject,
  activeThread,
  onThreadSelect,
  onThreadRename,
  onThreadDelete
}: ThreadSectionsProps) {
  if (!sections.length || !activeProject) {
    return (
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
    )
  }

  return (
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
  )
}

function ThreadSectionList({
  section,
  activeThread,
  onThreadSelect,
  onThreadRename,
  onThreadDelete
}: {
  section: ThreadSection
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
}) {
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
        {section.threads.map((thread) => (
          <ThreadListItemRow
            key={thread.id}
            thread={thread}
            isActive={activeThread?.id === thread.id}
            onSelect={onThreadSelect}
            onRename={onThreadRename}
            onDelete={onThreadDelete}
          />
        ))}
      </div>
    </div>
  )
}

function ThreadListItemRow({
  thread,
  isActive,
  onSelect,
  onRename,
  onDelete
}: {
  thread: ThreadListItem
  isActive: boolean
  onSelect: (thread: ThreadListItem) => void
  onRename: (thread: ThreadListItem, title: string) => Promise<void>
  onDelete: (thread: ThreadListItem) => Promise<void>
}) {
  const detail = thread.relativeTimestamp || thread.timestamp
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(thread.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleRenameSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
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
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            onClick={() => onSelect(thread)}
            className={cn(
              "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2.5 overflow-hidden rounded-md border px-3 py-2 text-left transition",
              isActive
                ? "border-primary/60 bg-primary/8 shadow-sm"
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
              setRenameError(null)
              setRenameValue(thread.title)
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
              setDeleteError(null)
              setIsDeleteDialogOpen(true)
            }}
          >
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

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

function StatusPill({ status }: { status: ThreadListItem["status"] }) {
  const colorMap: Record<ThreadListItem["status"], string> = {
    active: "bg-emerald-500",
    completed: "bg-sky-500",
    stopped: "bg-amber-500",
    failed: "bg-rose-500"
  }
  return <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", colorMap[status] ?? "bg-muted-foreground")}></span>
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
