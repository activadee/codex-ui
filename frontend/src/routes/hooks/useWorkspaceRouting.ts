import { useCallback, useEffect, useMemo, useRef } from "react"
import { matchPath, useLocation, useNavigate } from "react-router-dom"

import { threadToListItem } from "@/lib/threads"
import type { ThreadListItem } from "@/types/app"
import type { ReturnTypeWorkspace } from "@/routes/hooks/useWorkspaceTypes"

export type WorkspaceRoutingState = {
  sidebarLoading: boolean
  threadIdParam: number | null
  isNewThreadRoute: boolean
  handleThreadSelect: (thread: ThreadListItem) => void
  handleNewThreadRoute: () => void
}

export function useWorkspaceRouting(
  workspace: ReturnTypeWorkspace,
  clearComposer: () => void
): WorkspaceRoutingState {
  const location = useLocation()
  const navigate = useNavigate()

  const projectMatch = matchPath("/projects/:projectId/*", location.pathname)
  const threadMatch = matchPath("/projects/:projectId/threads/:threadId", location.pathname)

  const threadIdParamRaw = threadMatch?.params?.threadId ?? null
  const isNewThreadRoute = threadIdParamRaw === "new"
  const threadIdParam =
    threadIdParamRaw && !isNewThreadRoute && !Number.isNaN(Number(threadIdParamRaw))
      ? Number(threadIdParamRaw)
      : null

  const projectIdParam = projectMatch?.params?.projectId ? Number(projectMatch.params.projectId) : null
  const lastThreadIdRef = useRef<number | "new" | null>(null)

  useEffect(() => {
    if (workspace.projects.isLoading) {
      return
    }
    if (projectIdParam && !Number.isNaN(projectIdParam)) {
      const target = workspace.projects.list.find((project) => project.id === projectIdParam)
      if (target) {
        if (!workspace.projects.active || workspace.projects.active.id !== target.id) {
          void workspace.projects.select(target)
        }
        return
      }
      if (workspace.projects.list.length > 0 && location.pathname !== "/") {
        navigate("/", { replace: true })
      }
      return
    }
    if (workspace.projects.active) {
      const target = `/projects/${workspace.projects.active.id}`
      if (location.pathname !== target) {
        navigate(target, { replace: true })
      }
      return
    }
    if (workspace.projects.list.length > 0) {
      const first = workspace.projects.list[0]
      void workspace.projects.select(first)
      const target = `/projects/${first.id}`
      if (location.pathname !== target) {
        navigate(target, { replace: true })
      }
    }
  }, [
    navigate,
    projectIdParam,
    location.pathname,
    workspace.projects.active?.id,
    workspace.projects.isLoading,
    workspace.projects.list
  ])

  useEffect(() => {
    if (workspace.projects.isLoading || workspace.threads.isLoading) {
      return
    }
    const activeProject = workspace.projects.active
    if (!activeProject) {
      return
    }

    if (isNewThreadRoute) {
      workspace.threads.newThread()
      return
    }

    if (threadIdParam && !Number.isNaN(threadIdParam)) {
      const target = workspace.threads.list.find((thread) => thread.id === threadIdParam)
      if (target) {
        if (!workspace.threads.active || workspace.threads.active.id !== target.id) {
          workspace.threads.select(threadToListItem(target))
        }
        return
      }
      navigate(`/projects/${activeProject.id}`, { replace: true })
      return
    }

    // Only drive thread navigation when URL's project matches active project.
    if (
      (projectIdParam === null || projectIdParam === activeProject.id) &&
      workspace.threads.active &&
      workspace.threads.active.projectId === activeProject.id
    ) {
      const target = `/projects/${activeProject.id}/threads/${workspace.threads.active.id}`
      if (location.pathname !== target) {
        navigate(target, { replace: true })
      }
    }
  }, [
    isNewThreadRoute,
    navigate,
    threadIdParam,
    location.pathname,
    workspace.projects.active?.id,
    workspace.projects.isLoading,
    workspace.threads.active?.id,
    workspace.threads.isLoading,
    workspace.threads.list
  ])

  useEffect(() => {
    const currentId = isNewThreadRoute
      ? "new"
      : threadIdParam && !Number.isNaN(threadIdParam)
        ? threadIdParam
        : null
    if (currentId === lastThreadIdRef.current) {
      return
    }
    lastThreadIdRef.current = currentId
    clearComposer()
  }, [clearComposer, isNewThreadRoute, threadIdParam])

  const handleThreadSelect = useCallback(
    (thread: ThreadListItem) => {
      clearComposer()
      workspace.threads.select(thread)
      const targetProjectId = thread.projectId || workspace.projects.active?.id
      if (targetProjectId) {
        navigate(`/projects/${targetProjectId}/threads/${thread.id}`)
      }
    },
    [clearComposer, navigate, workspace.projects.active?.id, workspace.threads]
  )

  const handleNewThreadRoute = useCallback(() => {
    workspace.threads.newThread()
    if (workspace.projects.active) {
      navigate(`/projects/${workspace.projects.active.id}/threads/new`)
    }
  }, [navigate, workspace.projects.active, workspace.threads])

  const sidebarLoading = workspace.projects.isLoading || workspace.threads.isLoading

  return {
    sidebarLoading,
    threadIdParam,
    isNewThreadRoute,
    handleThreadSelect,
    handleNewThreadRoute
  }
}
