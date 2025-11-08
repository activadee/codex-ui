import { beforeEach, describe, expect, it, vi } from "vitest"
import { createStore } from "zustand/vanilla"

import type { projects } from "../../../wailsjs/go/models"
import type { PlatformBridge } from "@/platform/wailsBridge"

import { createProjectsSlice, type ProjectsSlice } from "./projectsSlice"

type ProjectsApiMock = {
  list: ReturnType<typeof vi.fn>
  register: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
  markOpened: ReturnType<typeof vi.fn>
}

function createBridgeMock() {
  const mock: { projects: ProjectsApiMock } = {
    projects: {
      list: vi.fn(),
      register: vi.fn(),
      delete: vi.fn(),
      markOpened: vi.fn()
    }
  }
  return { mock, bridge: mock as unknown as PlatformBridge }
}

describe("projectsSlice", () => {
  let bridge: PlatformBridge
  let mock: { projects: ProjectsApiMock }
  let store: ReturnType<typeof createProjectsStore>

  beforeEach(() => {
    const handles = createBridgeMock()
    bridge = handles.bridge
    mock = handles.mock
    store = createProjectsStore(bridge)
  })

  it("loads projects and selects the first entry by default", async () => {
    mock.projects.list.mockResolvedValueOnce([
      createProjectDto({ id: 1, path: "/tmp/alpha" }),
      createProjectDto({ id: 2, path: "/tmp/beta" })
    ])

    await store.getState().loadProjects()

    expect(store.getState().projects).toHaveLength(2)
    expect(store.getState().activeProjectId).toBe(1)
    expect(store.getState().hasLoadedProjects).toBe(true)
  })

  it("registers projects and keeps them active", async () => {
    const dto = createProjectDto({ id: 7, path: "/tmp/new" })
    mock.projects.register.mockResolvedValueOnce(dto)

    const project = await store.getState().registerProject({ path: dto.path })

    expect(project.id).toBe(7)
    expect(store.getState().projects[0]?.id).toBe(7)
    expect(store.getState().activeProjectId).toBe(7)
  })

  it("marks projects as opened when selected", async () => {
    await store.getState().selectProjectById(99)
    expect(mock.projects.markOpened).toHaveBeenCalledWith(99)
  })

  it("reverts optimistic delete when backend fails", async () => {
    mock.projects.list.mockResolvedValueOnce([
      createProjectDto({ id: 1, path: "/tmp/a" }),
      createProjectDto({ id: 2, path: "/tmp/b" })
    ])
    await store.getState().loadProjects()

    mock.projects.delete.mockRejectedValueOnce(new Error("boom"))

    await expect(store.getState().deleteProject(1)).rejects.toThrow()
    expect(store.getState().projects).toHaveLength(2)
    expect(store.getState().projectsError).toBe("boom")
  })
})

function createProjectsStore(bridge: PlatformBridge) {
  return createStore<ProjectsSlice>()(createProjectsSlice(bridge))
}

function createProjectDto(overrides: Partial<projects.ProjectDTO>): projects.ProjectDTO {
  return {
    id: overrides.id ?? Math.floor(Math.random() * 1000),
    path: overrides.path ?? "/tmp/project",
    displayName: overrides.displayName ?? "Project",
    tags: overrides.tags ?? [],
    lastOpenedAt: overrides.lastOpenedAt,
    name: overrides.name,
    description: overrides.description
  }
}
