import { useCallback, useState } from "react"

import { SelectProjectDirectory } from "../../../wailsjs/go/main/App"

export function useWorkspaceDialogs() {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [isSubmittingProject, setIsSubmittingProject] = useState(false)

  const openDialog = useCallback(() => {
    setDialogError(null)
    setIsDialogOpen(true)
  }, [])

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false)
  }, [])

  const handleChooseDirectory = useCallback(async (currentPath: string) => {
    try {
      return await SelectProjectDirectory(currentPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to open project picker."
      setDialogError(message)
      throw error
    }
  }, [])

  return {
    isDialogOpen,
    dialogError,
    isSubmittingProject,
    setDialogError,
    setIsSubmittingProject,
    openDialog,
    closeDialog,
    handleChooseDirectory
  }
}
