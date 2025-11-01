import { WorkspacePanel } from "@/components/app/workspace-panel"
import { Button } from "@/components/ui/button"
import type { Project, ThreadListItem, ThreadSection } from "@/types/app"
import { ProjectList } from "@/components/app/project-sidebar/project-list"
import { ThreadSections } from "@/components/app/project-sidebar/thread-sections"

export type ProjectSidebarProps = {
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

export function ProjectSidebar({
  projects,
  sections,
  activeProject,
  onProjectChange,
  onProjectDelete,
  onAddProject,
  onNewThread,
  isLoadingProjects,
  activeThread,
  onThreadSelect,
  onThreadRename,
  onThreadDelete
}: ProjectSidebarProps) {
  const totalThreads = sections.reduce((sum, section) => sum + section.threads.length, 0)

  return (
    <aside className="flex h-full w-full max-w-[288px] flex-col border-r border-border/70 bg-white">
      <WorkspacePanel
        title="Projects"
        className="flex h-1/2 flex-col"
        actions={
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-2"
            onClick={onAddProject}
            disabled={isLoadingProjects}
          >
            Add
          </Button>
        }
        bodyClassName="flex h-full min-h-0 flex-col gap-3 px-3 py-3"
      >
        <ProjectList
          projects={projects}
          activeProject={activeProject}
          onSelect={onProjectChange}
          onDelete={onProjectDelete}
        />
        {activeProject && totalThreads >= 0 && (
          <div className="rounded-md border border-border/60 bg-background/70 px-3 py-2 text-xs text-muted-foreground">
            <p className="text-sm font-semibold text-foreground">{activeProject.name}</p>
            <p className="mt-1">Tracked threads · {totalThreads}</p>
          </div>
        )}
      </WorkspacePanel>
      <WorkspacePanel
        title="Threads"
        className="flex h-1/2 flex-col"
        actions={
          <Button variant="default" size="sm" className="h-7 rounded-md px-3" onClick={onNewThread}>
            New
          </Button>
        }
        bodyClassName="flex h-full min-h-0 flex-col px-3 py-3"
      >
        <ThreadSections
          sections={sections}
          activeProject={activeProject}
          activeThread={activeThread}
          onThreadSelect={onThreadSelect}
          onThreadRename={onThreadRename}
          onThreadDelete={onThreadDelete}
        />
      </WorkspacePanel>
    </aside>
  )
}
