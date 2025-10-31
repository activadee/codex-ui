import type { ReactNode } from "react"

import { ProjectSidebar } from "@/components/app/project-sidebar"
import type { Project, ThreadListItem, ThreadSection } from "@/types/app"

type SidebarProps = {
  projects: Project[]
  sections: ThreadSection[]
  activeProject: Project | null
  onProjectChange: (project: Project) => void
  onProjectDelete: (project: Project) => void
  onAddProject: () => void
  onNewThread: () => void
  isLoadingProjects?: boolean
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
}

type WorkspaceShellProps = {
  sidebar: SidebarProps
  main: ReactNode
  footer?: ReactNode
}

export function WorkspaceShell({ sidebar, main, footer }: WorkspaceShellProps) {
  return (
    <div className="flex h-screen bg-white text-foreground">
      <ProjectSidebar
        projects={sidebar.projects}
        sections={sidebar.sections}
        activeProject={sidebar.activeProject}
        onProjectChange={sidebar.onProjectChange}
        onProjectDelete={sidebar.onProjectDelete}
        onAddProject={sidebar.onAddProject}
        isLoadingProjects={sidebar.isLoadingProjects}
        activeThread={sidebar.activeThread}
        onThreadSelect={sidebar.onThreadSelect}
        onNewThread={sidebar.onNewThread}
        onThreadRename={sidebar.onThreadRename}
        onThreadDelete={sidebar.onThreadDelete}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <main className="flex-1 min-h-0 overflow-hidden bg-white pb-5">{main}</main>
        {footer && <div className="border-t border-border/70 bg-white">{footer}</div>}
      </div>
    </div>
  )
}
