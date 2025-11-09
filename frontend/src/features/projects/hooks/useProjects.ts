import { useCallback, useEffect, useMemo } from "react"

import { useAppStore } from "@/state/createAppStore"
import type { Project } from "@/types/app"

export function useProjects() {
  const projects = useAppStore((state) => state.projects)
  const activeProjectId = useAppStore((state) => state.activeProjectId)
  const isLoading = useAppStore((state) => state.isLoadingProjects)
  const hasLoaded = useAppStore((state) => state.hasLoadedProjects)
  const error = useAppStore((state) => state.projectsError)
  const loadProjects = useAppStore((state) => state.loadProjects)
  const selectProjectById = useAppStore((state) => state.selectProjectById)
  const registerProjectAction = useAppStore((state) => state.registerProject)
  const deleteProject = useAppStore((state) => state.deleteProject)

  useEffect(() => {
    if (!hasLoaded) {
      void loadProjects()
    }
  }, [hasLoaded, loadProjects])

  const activeProject = useMemo(() => {
    if (!activeProjectId) {
      return projects[0] ?? null
    }
    return projects.find((project) => project.id === activeProjectId) ?? null
  }, [activeProjectId, projects])

  const selectProject = useCallback(
    async (project: Project) => {
      await selectProjectById(project?.id ?? null)
    },
    [selectProjectById]
  )

  const registerProject = useCallback(
    (path: string, displayName?: string, tags?: string[]) =>
      registerProjectAction({ path, displayName, tags }),
    [registerProjectAction]
  )

  return {
    projects,
    activeProject,
    isLoading,
    error,
    loadProjects,
    selectProject,
    registerProject,
    deleteProject
  }
}
