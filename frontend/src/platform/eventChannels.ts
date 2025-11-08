import type { FileDiffStat, StreamEventPayload } from "@/types/app"

/**
 * Declarative description of a Wails runtime event channel.
 * Downstream layers reference these helpers instead of hard-coding prefixes.
 * See docs/frontend-architecture.md for the rationale behind typed channels.
 */
export type PlatformEventChannel<TKey, TPayload> = {
  readonly name: string
  readonly description: string
  readonly priority: EventPriority
  topic: (key: TKey) => string
  match: (topic: string) => boolean
  extractKey: (topic: string) => TKey | null
}

export type EventPriority = "critical" | "high" | "default" | "low"

export type ThreadFileDiffEvent = {
  threadId: number
  files: FileDiffStat[]
}

export type AgentTerminalEvent = {
  threadId: number
  type: "ready" | "output" | "exit"
  data?: string
  status?: string
}

const streamPrefix = "agent:stream:"
const diffPrefix = "agent:file-change:"
const terminalPrefix = "agent:terminal:"

function prefixedChannel<TKey extends string | number, TPayload>(config: {
  name: string
  description: string
  priority: EventPriority
  prefix: string
  formatKey: (key: TKey) => string
  parseKey: (raw: string) => TKey | null
}): PlatformEventChannel<TKey, TPayload> {
  return {
    name: config.name,
    description: config.description,
    priority: config.priority,
    topic: (key: TKey) => `${config.prefix}${config.formatKey(key)}`,
    match: (topic: string) => topic.startsWith(config.prefix),
    extractKey: (topic: string) => {
      if (!topic.startsWith(config.prefix)) {
        return null
      }
      const raw = topic.slice(config.prefix.length)
      return config.parseKey(raw)
    }
  }
}

const parseNumberKey = (raw: string): number | null => {
  const value = Number.parseInt(raw, 10)
  if (Number.isNaN(value) || value <= 0) {
    return null
  }
  return value
}

/**
 * Stream channel for incremental agent responses.
 */
export const agentStreamChannel = prefixedChannel<string, StreamEventPayload>({
  name: "agent.stream",
  description: "Handles incremental agent output events",
  priority: "critical",
  prefix: streamPrefix,
  formatKey: (key) => key,
  parseKey: (raw) => raw || null
})

/**
 * File diff channel for per-thread diff summaries.
 */
export const threadDiffChannel = prefixedChannel<number, ThreadFileDiffEvent>({
  name: "agent.diff",
  description: "Publishes aggregated file diff stats for a thread",
  priority: "high",
  prefix: diffPrefix,
  formatKey: (threadId) => threadId.toString(),
  parseKey: parseNumberKey
})

/**
 * Terminal channel for live workspace output streaming.
 */
export const agentTerminalChannel = prefixedChannel<number, AgentTerminalEvent>({
  name: "agent.terminal",
  description: "Delivers terminal lifecycle events scoped to a thread",
  priority: "default",
  prefix: terminalPrefix,
  formatKey: (threadId) => threadId.toString(),
  parseKey: parseNumberKey
})

// Convenience wrappers retained for legacy callers during the migration.
export const streamTopic = (streamId: string) => agentStreamChannel.topic(streamId)
export const fileChangeTopic = (threadId: number) => threadDiffChannel.topic(threadId)
export const terminalTopic = (threadId: number) => agentTerminalChannel.topic(threadId)
