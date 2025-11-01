import { useState } from "react"

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Project } from "@/types/app"

export type ProjectListProps = {
  projects: Project[]
  activeProject: Project | null
  onSelect: (project: Project) => void
  onDelete: (project: Project) => void
}

export function ProjectList({ projects, activeProject, onSelect, onDelete }: ProjectListProps) {
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

function ProjectListItemRow({ project, isActive, onSelect, onDelete }: {
  project: Project
  isActive: boolean
  onSelect: (project: Project) => void
  onDelete: (project: Project) => void
}) {
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
              isActive ? "border-primary/60 bg-primary/8 shadow-sm" : "border-border/60 bg-card hover:bg-muted/70"
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
