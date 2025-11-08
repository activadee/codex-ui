import { useMemo } from "react"
import { useInfiniteQuery } from "@tanstack/react-query"

import { LoadThreadConversationPage } from "../../wailsjs/go/agents/API"
import { agents } from "../../wailsjs/go/models"
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

type ConversationPage = {
  entries: ConversationEntry[]
  nextCursor?: string
  hasMore: boolean
}

const PAGE_SIZE = 30

export function useThreadConversation(threadId: number | null) {
  const conversationQuery = useInfiniteQuery<ConversationPage, Error>({
    queryKey: ["conversation", threadId ?? "none"],
    enabled: Boolean(threadId),
    initialPageParam: undefined,
    queryFn: async ({ pageParam }): Promise<ConversationPage> => {
      if (!threadId) {
        return { entries: [], hasMore: false }
      }
      const request: agents.ConversationPageRequest = {
        threadId,
        limit: PAGE_SIZE
      }
      if (typeof pageParam === "string" && pageParam.trim().length > 0) {
        request.cursor = pageParam
      }
      const response = agents.ConversationPageDTO.createFrom(await LoadThreadConversationPage(request))
      const rawCursor = response.nextCursor
      let nextCursor: string | undefined
      if (typeof rawCursor === "string" && rawCursor.trim().length > 0) {
        nextCursor = rawCursor
      }
      return {
        entries: normaliseConversation(response.entries ?? []),
        nextCursor,
        hasMore: Boolean(response.hasMore)
      }
    },
    getNextPageParam: (lastPage) => (lastPage.nextCursor ? lastPage.nextCursor : undefined),
    gcTime: 120_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: false
  })

  const entries = useMemo(() => {
    if (!conversationQuery.data) {
      return [] as ConversationEntry[]
    }
    const pages = conversationQuery.data.pages ?? []
    if (pages.length === 0) {
      return [] as ConversationEntry[]
    }
    return [...pages]
      .reverse()
      .flatMap((page) => page.entries ?? [])
  }, [conversationQuery.data])

  const errorMessage = conversationQuery.error ? conversationQuery.error.message ?? "Failed to load conversation" : null

  return {
    entries,
    isLoading: conversationQuery.isPending,
    isFetching: conversationQuery.isFetching,
    isFetchingMore: conversationQuery.isFetchingNextPage,
    hasMore: conversationQuery.hasNextPage ?? false,
    fetchMore: conversationQuery.fetchNextPage,
    error: errorMessage,
    refetch: conversationQuery.refetch
  }
}
