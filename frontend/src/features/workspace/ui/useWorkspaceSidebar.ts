import { useMemo } from "react"

import type { Project, ThreadListItem } from "@/types/app"

export type SidebarHandlers = {
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
  onProjectChange: (project: Project) => void
  onProjectDelete: (project: Project) => void
  onAddProject: () => void
  onNewThread: () => void
}

export type SidebarState = {
  projects: any
  threads: any
  sidebarLoading: boolean
  openProjectDialog: () => void
}

export function useWorkspaceSidebar(handlers: SidebarHandlers, state: SidebarState) {
  return useMemo(
    () => ({
      projects: state.projects.list,
      sections: state.threads.sections,
      activeProject: state.projects.active,
      onProjectChange: handlers.onProjectChange,
      onProjectDelete: handlers.onProjectDelete,
      onAddProject: handlers.onAddProject,
      onNewThread: handlers.onNewThread,
      isLoadingProjects: state.sidebarLoading,
      activeThread: state.threads.active,
      onThreadSelect: handlers.onThreadSelect,
      onThreadRename: handlers.onThreadRename,
      onThreadDelete: handlers.onThreadDelete
    }),
    [handlers, state]
  )
}
