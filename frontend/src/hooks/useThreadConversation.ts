import { useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { LoadThreadConversation } from "../../wailsjs/go/agents/API"
import type {
  AgentConversationEntry,
  AgentItemPayload,
  ConversationEntry,
  SystemConversationEntry,
  UserConversationEntry,
  UserMessageSegment
} from "@/types/app"

function cloneAgentItem(item: AgentItemPayload | undefined): AgentItemPayload {
  if (!item) {
    return { id: "", type: "agent_message", text: "" }
  }
  return JSON.parse(JSON.stringify(item)) as AgentItemPayload
}

export function normaliseConversation(entries: any[]): ConversationEntry[] {
  return entries.map((entry) => {
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
      }
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
      }
    }
    return {
      id: entry.id,
      role: "system" as const,
      createdAt: entry.createdAt,
      tone: (entry.tone as SystemConversationEntry["tone"]) ?? "info",
      message: entry.message ?? "",
      meta: entry.meta ?? {}
    }
  })
}

export function useThreadConversation(threadId: number | null) {
  const queryClient = useQueryClient()

  const queryKey = ["conversation", threadId ?? "none"]

  const conversationQuery = useQuery({
    queryKey,
    enabled: Boolean(threadId),
    queryFn: async (): Promise<ConversationEntry[]> => {
      if (!threadId) {
        return []
      }
      const response = await LoadThreadConversation(threadId)
      return normaliseConversation(response)
    },
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 120_000
  })

  const setConversation = useCallback(
    (updater: (current: ConversationEntry[]) => ConversationEntry[]) => {
      queryClient.setQueryData<ConversationEntry[]>(queryKey, (prev = []) => updater(prev))
    },
    [queryClient, queryKey]
  )

  return {
    entries: conversationQuery.data ?? [],
    isLoading: conversationQuery.isPending || conversationQuery.isFetching,
    error: conversationQuery.error
      ? conversationQuery.error instanceof Error
        ? conversationQuery.error.message
        : "Failed to load conversation"
      : null,
    refetch: () => conversationQuery.refetch(),
    setConversation
  }
}
