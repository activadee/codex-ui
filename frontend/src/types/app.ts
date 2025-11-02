export type Project = {
  id: number
  path: string
  name: string
  description: string
  tags?: string[]
  lastOpenedAt?: string
}

export type ThreadStatus = "active" | "completed" | "stopped" | "failed"

export type AgentThread = {
  id: number
  projectId: number
  externalId?: string
  worktreePath?: string
  branchName?: string
  prUrl?: string
  branch?: string
  pullRequestNumber?: number
  diffStat?: {
    added: number
    removed: number
  }
  title: string
  model: string
  sandboxMode: string
  reasoningLevel: string
  status: ThreadStatus
  createdAt: string
  updatedAt: string
  lastMessageAt?: string
  preview: string
  lastTimestamp: string
}

export type FileDiffStat = {
  path: string
  added: number
  removed: number
  status?: string
}

export type ThreadListItem = {
  id: number
  projectId: number
  title: string
  preview: string
  timestamp: string
  relativeTimestamp: string
  lastActivityAt?: string
  model: string
  status: ThreadStatus
  statusLabel: string
  progressText: string
  meta?: string
  branch?: string
  pullRequestNumber?: number
  diffStat?: {
    added: number
    removed: number
  }
}

export type ThreadSection = {
  label: string
  subtitle?: string
  threads: ThreadListItem[]
}

export type UserMessageSegment =
  | { type: "text"; text: string }
  | { type: "image"; imagePath: string }

export type AgentUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export type ImageAttachment = {
  id: string
  path: string
  previewUrl: string
  mimeType: string
  size: number
  name: string
}

export type StreamEventPayload = {
  type: string
  threadId?: string
  item?: AgentItemPayload
  usage?: AgentUsage
  error?: { message: string }
  message?: string
}

export type AgentItemPayload = {
  id: string
  type: string
  text?: string
  reasoning?: string
  command?: {
    command: string
    aggregatedOutput: string
    exitCode?: number
    status: string
  }
  fileDiffs?: Array<{ path: string; kind: string; status: string }>
  toolCall?: {
    server: string
    tool: string
    status: string
  }
  webSearch?: { query: string }
  todoList?: { items: Array<{ text: string; completed: boolean }> }
  error?: { message: string }
}

export type AgentConversationEntry = {
  id: string
  role: "agent"
  createdAt: string
  updatedAt: string
  item: AgentItemPayload
}

export type UserConversationEntry = {
  id: string
  role: "user"
  createdAt: string
  text: string
  segments?: UserMessageSegment[]
}

export type SystemConversationEntry = {
  id: string
  role: "system"
  createdAt: string
  tone?: "info" | "error" | "warning"
  message: string
  meta?: Record<string, unknown>
}

export type ConversationEntry =
  | AgentConversationEntry
  | UserConversationEntry
  | SystemConversationEntry
