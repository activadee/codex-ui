import type {
  AgentConversationEntry,
  AgentItemPayload,
  ConversationEntry,
  SystemConversationEntry,
  UserConversationEntry,
  UserMessageSegment
} from "@/types/app"

function parseTimestamp(value?: string | null) {
  if (!value) {
    return 0
  }
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

function compareConversationEntries(a: ConversationEntry, b: ConversationEntry) {
  const createdDiff = parseTimestamp(a.createdAt) - parseTimestamp(b.createdAt)
  if (createdDiff !== 0) {
    return createdDiff
  }

  const updatedDiff =
    parseTimestamp("updatedAt" in a ? (a as AgentConversationEntry).updatedAt : a.createdAt) -
    parseTimestamp("updatedAt" in b ? (b as AgentConversationEntry).updatedAt : b.createdAt)
  if (updatedDiff !== 0) {
    return updatedDiff
  }

  return a.id.localeCompare(b.id)
}

export function sortConversationEntries(entries: ConversationEntry[]): ConversationEntry[] {
  if (entries.length <= 1) {
    return entries.slice()
  }
  return [...entries].sort(compareConversationEntries)
}

function cloneAgentItem(item: AgentItemPayload | undefined): AgentItemPayload {
  if (!item) {
    return { id: "", type: "agent_message", text: "" }
  }
  return JSON.parse(JSON.stringify(item)) as AgentItemPayload
}

export function normaliseConversation(entries: any[]): ConversationEntry[] {
  const normalized = entries.map((entry) => {
    if (entry.role === "agent") {
      const cloned = cloneAgentItem(entry.item)
      return {
        id: entry.id,
        role: "agent" as const,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt ?? entry.createdAt,
        item: {
          ...cloned,
          id: cloned.id || entry.id
        }
      } satisfies AgentConversationEntry
    }
    if (entry.role === "user") {
      const segments: UserMessageSegment[] = (entry.segments ?? []).map((segment: any) => {
        if (segment.type === "image") {
          return { type: "image", imagePath: segment.imagePath ?? "" }
        }
        return { type: "text", text: segment.text ?? "" }
      })
      return {
        id: entry.id,
        role: "user" as const,
        createdAt: entry.createdAt,
        text: entry.text ?? "",
        segments
      } satisfies UserConversationEntry
    }
    return {
      id: entry.id,
      role: "system" as const,
      createdAt: entry.createdAt,
      tone: (entry.tone as SystemConversationEntry["tone"]) ?? "info",
      message: entry.message ?? "",
      meta: entry.meta ?? {}
    } satisfies SystemConversationEntry
  })
  return sortConversationEntries(normalized)
}
