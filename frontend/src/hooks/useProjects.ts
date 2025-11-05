import { useCallback, useEffect, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { DeleteProject, ListProjects, MarkProjectOpened, RegisterProject } from "../../wailsjs/go/projects/API"
import { mapProjectDtoToProject } from "@/lib/projects"
import type { Project } from "@/types/app"

export function useProjects() {
  const queryClient = useQueryClient()
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProject, setActiveProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  const projectsQuery = useQuery({
    queryKey: ["projects"],
    queryFn: async (): Promise<Project[]> => {
      const response = await ListProjects()
      return response.map(mapProjectDtoToProject)
    },
    staleTime: 30_000
  })

  const projectsData = projectsQuery.data ?? []

  useEffect(() => {
    setProjects(projectsData)
    setActiveProject((prev) => {
      if (projectsData.length === 0) {
        return null
      }
      if (prev) {
        const existing = projectsData.find((item) => item.id === prev.id)
        return existing ?? projectsData[0]
      }
      return projectsData[0]
    })
  }, [projectsData])

  const queryErrorMessage = useMemo(() => {
    if (!projectsQuery.error) {
      return null
    }
    const err = projectsQuery.error
    return err instanceof Error ? err.message : "Failed to load projects"
  }, [projectsQuery.error])

  useEffect(() => {
    setError(queryErrorMessage)
  }, [queryErrorMessage])

  const selectProject = useCallback(async (project: Project) => {
    setActiveProject(project)
    try {
      await MarkProjectOpened(project.id)
    } catch (err) {
      console.error("Failed to mark project opened", err)
    }
  }, [])

  const registerMutation = useMutation({
    mutationFn: async (payload: { path: string; displayName?: string; tags?: string[] }) => {
      const response = await RegisterProject(payload)
      return mapProjectDtoToProject(response)
    },
    onSuccess: (project) => {
      queryClient.setQueryData<Project[]>(["projects"], (prev = []) => {
        const index = prev.findIndex((item) => item.id === project.id)
        if (index >= 0) {
          const clone = [...prev]
          clone[index] = project
          return clone
        }
        return [project, ...prev]
      })
      setActiveProject(project)
      setError(null)
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to register project"
      setError(message)
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await DeleteProject(id)
      return id
    },
    onSuccess: (id) => {
      queryClient.setQueryData<Project[]>(["projects"], (prev = []) => prev.filter((project) => project.id !== id))
      setActiveProject((current) => {
        if (current?.id === id) {
          return null
        }
        return current
      })
      setError(null)
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "Failed to delete project"
      setError(message)
    }
  })

  const registerProject = useCallback(
    async (path: string, displayName?: string, tags?: string[]) => {
      const project = await registerMutation.mutateAsync({ path, displayName, tags })
      return project
    },
    [registerMutation]
  )

  const deleteProject = useCallback(
    async (id: number) => {
      await deleteMutation.mutateAsync(id)
    },
    [deleteMutation]
  )

  const loadProjects = useCallback(async () => {
    await projectsQuery.refetch()
  }, [projectsQuery])

  const isLoading = projectsQuery.isPending || projectsQuery.isFetching

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
