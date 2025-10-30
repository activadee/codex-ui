import { useEffect, useMemo, useState } from "react"
import { FolderOpen, Loader2 } from "lucide-react"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

type ProjectFormValues = {
  path: string
  displayName: string
  tags: string[]
}

type ManageProjectDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  isSubmitting: boolean
  errorMessage?: string | null
  onSubmit: (values: ProjectFormValues) => Promise<void>
  onBrowseForDirectory: (currentPath: string) => Promise<string>
}

export function ManageProjectDialog({
  open,
  onOpenChange,
  isSubmitting,
  errorMessage,
  onSubmit,
  onBrowseForDirectory
}: ManageProjectDialogProps) {
  const [path, setPath] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [tagsInput, setTagsInput] = useState("")
  const [localError, setLocalError] = useState<string | null>(null)
  const [nameTouched, setNameTouched] = useState(false)

  useEffect(() => {
    if (!open) {
      setPath("")
      setDisplayName("")
      setTagsInput("")
      setLocalError(null)
      setNameTouched(false)
    }
  }, [open])

  const inferredName = useMemo(() => {
    if (!path) {
      return ""
    }
    const segments = path.split(/[\\/]/).filter(Boolean)
    return segments.pop() ?? ""
  }, [path])

  useEffect(() => {
    if (!nameTouched && inferredName) {
      setDisplayName(inferredName)
    }
  }, [inferredName, nameTouched])

  const handleBrowse = async () => {
    try {
      const selection = await onBrowseForDirectory(path)
      if (selection) {
        setPath(selection)
        setLocalError(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open directory dialog."
      setLocalError(message)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!path) {
      setLocalError("Select a project directory.")
      return
    }
    const normalisedTags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean)

    setLocalError(null)
    try {
      await onSubmit({
        path,
        displayName: displayName.trim(),
        tags: normalisedTags
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to register project."
      setLocalError(message)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Register a project</DialogTitle>
          <DialogDescription>Select a Codex workspace directory to add it to your catalog.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="project-path">Project path</Label>
            <div className="flex items-center gap-2">
              <Input
                id="project-path"
                value={path}
                onChange={(event) => setPath(event.target.value)}
                placeholder="/path/to/workspace"
                className="flex-1"
                required
              />
              <Button type="button" variant="secondary" onClick={handleBrowse}>
                <FolderOpen className="mr-2 h-4 w-4" />
                Browse
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-name">Display name</Label>
            <Input
              id="project-name"
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value)
                setNameTouched(true)
              }}
              placeholder="Codex UI"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-tags">Tags</Label>
            <Input
              id="project-tags"
              value={tagsInput}
              onChange={(event) => setTagsInput(event.target.value)}
              placeholder="comma,separated,tags"
            />
          </div>
          {(localError || errorMessage) && (
            <p className="text-sm text-destructive">{localError ?? errorMessage}</p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save project"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
