import type { ThreadListItem, ThreadSection } from "@/types/app"

import { EmptyThreadState } from "./thread-sections-empty-state"
import { ThreadSectionList } from "./thread-section-list"

export type ThreadSectionsProps = {
  sections: ThreadSection[]
  activeProject: { id: number } | null
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
}

export function ThreadSections({
  sections,
  activeProject,
  activeThread,
  onThreadSelect,
  onThreadRename,
  onThreadDelete
}: ThreadSectionsProps) {
  if (!sections.length || !activeProject) {
    return <EmptyThreadState hasProject={Boolean(activeProject)} />
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto pr-1">
      <div className="space-y-4">
        {sections.map((section) => (
          <ThreadSectionList
            key={section.label}
            section={section}
            activeThread={activeThread}
            onThreadSelect={onThreadSelect}
            onThreadRename={onThreadRename}
            onThreadDelete={onThreadDelete}
          />
        ))}
      </div>
    </div>
  )
}
