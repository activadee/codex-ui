import type { ConversationEntry } from "@/types/app"

import { AgentEntryCard } from "./agent-entry-card"
import { SystemEntryCard } from "./system-entry-card"
import { UserEntryCard } from "./user-entry-card"

type ConversationEntryCardProps = {
  entry: ConversationEntry
}

export function ConversationEntryCard({ entry }: ConversationEntryCardProps) {
  if (entry.role === "agent" && entry.item?.type === "todo_list") {
    return null
  }

  switch (entry.role) {
    case "user":
      return <UserEntryCard entry={entry} />
    case "agent":
      return <AgentEntryCard entry={entry} />
    case "system":
      return <SystemEntryCard entry={entry} />
    default:
      return null
  }
}
