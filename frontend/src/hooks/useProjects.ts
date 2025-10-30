import { useCallback, useEffect, useState } from "react"

import { DeleteProject, ListProjects, MarkProjectOpened, RegisterProject } from "../../wailsjs/go/main/App"
import { mapProjectDtoToProject } from "@/lib/projects"
import type { Project } from "@/types/app"

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProjects = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await ListProjects()
      const mapped = response.map(mapProjectDtoToProject)
      setProjects(mapped)
      setActiveProject((prev) => {
        if (!mapped.length) {
          return null
        }
        if (prev) {
          const existing = mapped.find((item) => item.id === prev.id)
          return existing ?? mapped[0]
        }
        return mapped[0]
      })
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load projects"
      setError(message)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const selectProject = useCallback(async (project: Project) => {
    setActiveProject(project)
    try {
      await MarkProjectOpened(project.id)
    } catch (err) {
      console.error("Failed to mark project opened", err)
    }
  }, [])

  const registerProject = useCallback(
    async (path: string, displayName?: string, tags?: string[]) => {
      try {
        const response = await RegisterProject({
          path,
          displayName,
          tags
        })
        const mapped = mapProjectDtoToProject(response)
        setProjects((prev) => {
          const existingIndex = prev.findIndex((item) => item.id === mapped.id)
          if (existingIndex >= 0) {
            const clone = [...prev]
            clone[existingIndex] = mapped
            return clone
          }
          return [mapped, ...prev]
        })
        setActiveProject(mapped)
        setError(null)
        return mapped
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to register project"
        setError(message)
        throw err
      }
    },
    []
  )

  const deleteProject = useCallback(async (id: number) => {
    try {
      await DeleteProject(id)
      setProjects((prev) => prev.filter((project) => project.id !== id))
      setActiveProject((current) => {
        if (current?.id === id) {
          return null
        }
        return current
      })
      setError(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete project"
      setError(message)
      throw err
    }
  }, [])

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
