import { useMemo, useState } from "react"

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
import { cn } from "@/lib/utils"
import type { ThreadListItem } from "@/types/app"

type ThreadListItemRowProps = {
  thread: ThreadListItem
  isActive: boolean
  onSelect: (thread: ThreadListItem) => void
  onRename: (thread: ThreadListItem, title: string) => Promise<void>
  onDelete: (thread: ThreadListItem) => Promise<void>
}

export function ThreadListItemRow({ thread, isActive, onSelect, onRename, onDelete }: ThreadListItemRowProps) {
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [renameValue, setRenameValue] = useState(thread.title)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const timeLabel = useMemo(() => {
    return formatShortRelativeTime(thread.lastActivityAt) || thread.relativeTimestamp || thread.timestamp
  }, [thread.lastActivityAt, thread.relativeTimestamp, thread.timestamp])

  const metadataLine = useMemo(() => {
    const items: string[] = []
    const branchLabel = formatBranchLabel(thread.branch)
    if (branchLabel) {
      items.push(branchLabel)
    }
    if (typeof thread.pullRequestNumber === "number") {
      items.push(`PR #${thread.pullRequestNumber}`)
    }
    return items.join(" • ")
  }, [thread.branch, thread.pullRequestNumber])

  const previewLine = useMemo(() => {
    const trimmedPreview = thread.preview?.trim()
    if (!trimmedPreview) {
      return ""
    }
    if (trimmedPreview === thread.title?.trim()) {
      return ""
    }
    return trimmedPreview
  }, [thread.preview, thread.title])

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
              "group grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 overflow-hidden rounded-lg border px-2.5 py-2 text-left transition",
              isActive
                ? "border-primary/60 bg-primary/10 shadow-sm"
                : "border-border/60 bg-card hover:bg-muted/60"
            )}
          >
            <span className="col-start-1 col-end-2 truncate text-[13px] font-medium leading-tight text-foreground">
              {thread.title}
            </span>
            <div className="col-start-2 row-start-1 flex min-w-[44px] flex-col items-end text-right">
              {timeLabel && (
                <span
                  className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  title={thread.timestamp}
                >
                  {timeLabel}
                </span>
              )}
            </div>
            {(metadataLine || hasDiffStat(thread.diffStat)) && (
              <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 text-[10px] font-medium leading-snug text-muted-foreground">
                {metadataLine && <span className="flex-1 break-words">{metadataLine}</span>}
                {hasDiffStat(thread.diffStat) && thread.diffStat && (
                  <div className="flex items-center gap-1 text-[9px] font-semibold">
                    {thread.diffStat.added > 0 && (
                      <span className="text-emerald-600">+{thread.diffStat.added}</span>
                    )}
                    {thread.diffStat.removed > 0 && (
                      <span className="text-rose-600">-{thread.diffStat.removed}</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {previewLine && (
              <div className="col-span-2 text-[11px] leading-snug text-muted-foreground/80 break-words">
                {previewLine}
              </div>
            )}
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

function formatShortRelativeTime(value?: string) {
  if (!value) {
    return ""
  }
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return ""
  }
  const diffMs = Date.now() - timestamp.getTime()
  const abs = Math.abs(diffMs)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  const week = 7 * day
  const month = 30 * day
  const year = 365 * day

  if (abs < minute) {
    return "now"
  }
  if (abs < hour) {
    const minutes = Math.max(1, Math.round(abs / minute))
    return `${minutes}m`
  }
  if (abs < day) {
    const hours = Math.max(1, Math.round(abs / hour))
    return `${hours}h`
  }
  if (abs < week) {
    const days = Math.max(1, Math.round(abs / day))
    return `${days}d`
  }
  if (abs < month) {
    const weeks = Math.max(1, Math.round(abs / week))
    return `${weeks}w`
  }
  if (abs < year) {
    const months = Math.max(1, Math.round(abs / month))
    return `${months}mo`
  }
  const years = Math.max(1, Math.round(abs / year))
  return `${years}y`
}

function formatBranchLabel(branch?: string | null) {
  if (!branch) {
    return ""
  }
  return branch.replace(/^refs\/heads\//, "")
}

function hasDiffStat(stat?: ThreadListItem["diffStat"]) {
  return Boolean(stat && (stat.added > 0 || stat.removed > 0))
}
