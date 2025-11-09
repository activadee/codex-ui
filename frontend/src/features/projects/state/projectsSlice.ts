import type { StateCreator } from "zustand"

import { mapProjectDtoToProject } from "@/lib/projects"
import type { PlatformBridge } from "@/platform/wailsBridge"
import type { Project } from "@/types/app"

export type RegisterProjectInput = {
  path: string
  displayName?: string
  tags?: string[]
}

export type ProjectsSlice = {
  projects: Project[]
  activeProjectId: number | null
  isLoadingProjects: boolean
  hasLoadedProjects: boolean
  projectsError: string | null
  loadProjects: () => Promise<void>
  selectProjectById: (projectId: number | null, options?: { markOpened?: boolean }) => Promise<void>
  registerProject: (input: RegisterProjectInput) => Promise<Project>
  deleteProject: (projectId: number) => Promise<void>
}

export const createProjectsSlice = (bridge: PlatformBridge): StateCreator<ProjectsSlice, [], []> => {
  return (set, get) => {
    const loadProjects = async () => {
      set((state) => ({ ...state, isLoadingProjects: true, projectsError: null }))
      try {
        const dtos = await bridge.projects.list()
        const projects = dtos.map(mapProjectDtoToProject)
        set((state) => ({
          ...state,
          projects,
          activeProjectId: resolveActiveProjectId(state.activeProjectId, projects),
          projectsError: null,
          hasLoadedProjects: true
        }))
      } catch (error) {
        set((state) => ({
          ...state,
          projectsError: normalizeError(error)
        }))
      } finally {
        set((state) => ({ ...state, isLoadingProjects: false }))
      }
    }

    const selectProjectById = async (projectId: number | null, options?: { markOpened?: boolean }) => {
      set((state) => ({ ...state, activeProjectId: projectId }))
      if (projectId && options?.markOpened !== false) {
        try {
          await bridge.projects.markOpened(projectId)
        } catch (error) {
          set((state) => ({
            ...state,
            projectsError: normalizeError(error)
          }))
        }
      }
    }

    const registerProject = async (input: RegisterProjectInput) => {
      set((state) => ({ ...state, projectsError: null }))
      try {
        const dto = await bridge.projects.register(input)
        const project = mapProjectDtoToProject(dto)
        set((state) => ({
          ...state,
          projects: upsertProject(state.projects, project),
          activeProjectId: project.id,
          projectsError: null
        }))
        return project
      } catch (error) {
        const message = normalizeError(error)
        set((state) => ({ ...state, projectsError: message }))
        throw error
      }
    }

    const deleteProject = async (projectId: number) => {
      const previousProjects = get().projects
      const previousActive = get().activeProjectId
      const nextProjects = previousProjects.filter((project) => project.id !== projectId)
      const nextActive = resolveActiveProjectId(previousActive === projectId ? null : previousActive, nextProjects)

      set((state) => ({
        ...state,
        projects: nextProjects,
        activeProjectId: nextActive,
        projectsError: null
      }))

      try {
        await bridge.projects.delete(projectId)
      } catch (error) {
        const message = normalizeError(error)
        set((state) => ({
          ...state,
          projects: previousProjects,
          activeProjectId: previousActive,
          projectsError: message
        }))
        throw error
      }
    }

    return {
      projects: [],
      activeProjectId: null,
      isLoadingProjects: false,
      hasLoadedProjects: false,
      projectsError: null,
      loadProjects,
      selectProjectById,
      registerProject,
      deleteProject
    }
  }
}

function resolveActiveProjectId(currentId: number | null, projects: Project[]): number | null {
  if (projects.length === 0) {
    return null
  }
  if (currentId && projects.some((project) => project.id === currentId)) {
    return currentId
  }
  return projects[0]?.id ?? null
}

function upsertProject(projects: Project[], next: Project): Project[] {
  const existingIndex = projects.findIndex((project) => project.id === next.id)
  if (existingIndex === -1) {
    return [next, ...projects]
  }
  const clone = [...projects]
  clone[existingIndex] = next
  return clone
}

function normalizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  if (typeof error === "string") {
    return error
  }
  return "Something went wrong"
}
