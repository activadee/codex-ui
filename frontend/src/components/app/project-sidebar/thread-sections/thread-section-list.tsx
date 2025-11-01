import { BadgeCheck, Clock3, Flame, Rocket } from "lucide-react"

import type { ThreadListItem, ThreadSection } from "@/types/app"

import { ThreadListItemRow } from "./thread-list-item-row"

type ThreadSectionListProps = {
  section: ThreadSection
  activeThread: ThreadListItem | null
  onThreadSelect: (thread: ThreadListItem) => void
  onThreadRename: (thread: ThreadListItem, title: string) => Promise<void>
  onThreadDelete: (thread: ThreadListItem) => Promise<void>
}

export function ThreadSectionList({
  section,
  activeThread,
  onThreadSelect,
  onThreadRename,
  onThreadDelete
}: ThreadSectionListProps) {
  const icon = getSectionIcon(section.label)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            {section.label}
          </p>
          {section.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{section.subtitle}</p>}
        </div>
        {icon}
      </div>
      <div className="space-y-1.5">
        {section.threads.map((thread) => (
          <ThreadListItemRow
            key={thread.id}
            thread={thread}
            isActive={activeThread?.id === thread.id}
            onSelect={onThreadSelect}
            onRename={onThreadRename}
            onDelete={onThreadDelete}
          />
        ))}
      </div>
    </div>
  )
}

function getSectionIcon(label: string) {
  switch (label.toLowerCase()) {
    case "in progress":
      return <Rocket className="h-4 w-4 text-primary" aria-hidden />
    case "archived":
      return <Clock3 className="h-4 w-4 text-muted-foreground" aria-hidden />
    case "older":
      return <BadgeCheck className="h-4 w-4 text-emerald-500" aria-hidden />
    default:
      return <Flame className="h-4 w-4 text-amber-500" aria-hidden />
  }
}
