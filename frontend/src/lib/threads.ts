import { agents } from "../../wailsjs/go/models"
import type { AgentThread, ThreadListItem, ThreadSection } from "@/types/app"

const streamTopicPrefix = "agent:stream:"
const fileChangeTopicPrefix = "agent:file-change:"
const terminalTopicPrefix = "agent:terminal:"

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "short",
  timeStyle: "short"
})

const relativeFormatter = new Intl.RelativeTimeFormat(undefined, {
  numeric: "auto"
})

export function mapThreadDtoToThread(dto: agents.ThreadDTO): AgentThread {
  const lastTimestamp = dto.lastMessageAt ?? dto.updatedAt
  return {
    id: dto.id,
    projectId: dto.projectId,
    externalId: dto.externalId,
    worktreePath: dto.worktreePath,
    title: dto.title,
    model: dto.model,
    sandboxMode: dto.sandboxMode,
    reasoningLevel: dto.reasoningLevel,
    status: dto.status as AgentThread["status"],
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
    lastMessageAt: dto.lastMessageAt,
    preview: dto.title,
    lastTimestamp: lastTimestamp ? formatTimestamp(lastTimestamp) : ""
  }
}

export function formatThreadSections(threads: AgentThread[]): ThreadSection[] {
  if (!threads.length) {
    return []
  }

  const buckets: Record<string, ThreadListItem[]> = {
    "IN PROGRESS": [],
    OLDER: [],
    ARCHIVED: []
  }

  threads.forEach((thread) => {
    const item = threadToListItem(thread)
    switch (thread.status) {
      case "active":
        buckets["IN PROGRESS"].push(item)
        break
      case "completed":
      case "stopped":
        buckets.OLDER.push(item)
        break
      default:
        buckets.ARCHIVED.push(item)
        break
    }
  })

  const subtitles: Record<string, string> = {
    "IN PROGRESS": "Live conversations running right now",
    OLDER: "Recent sessions and hand-offs",
    ARCHIVED: "Past threads for reference"
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length)
    .map(([label, items]) => ({ label, subtitle: subtitles[label], threads: items }))
}

export function updateThreadPreview(
  thread: AgentThread,
  previewText: string,
  occurredAt?: string
): AgentThread {
  const trimmed = previewText.trim()
  const normalized = trimmed.split("\n")[0]
  const nextPreview = normalized || thread.preview
  const timestampSource = occurredAt ?? thread.lastMessageAt ?? thread.updatedAt
  return {
    ...thread,
    preview: nextPreview,
    lastMessageAt: occurredAt ?? thread.lastMessageAt,
    lastTimestamp: formatTimestamp(timestampSource)
  }
}

export function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return ""
  }
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) {
    return ""
  }
  return dateFormatter.format(time)
}

export function streamTopic(streamId: string): string {
  return `${streamTopicPrefix}${streamId}`
}

export function fileChangeTopic(threadId: number): string {
  return `${fileChangeTopicPrefix}${threadId}`
}

export function terminalTopic(threadId: number): string {
  return `${terminalTopicPrefix}${threadId}`
}

export function threadToListItem(thread: AgentThread): ThreadListItem {
  const timestampSource = thread.lastMessageAt ?? thread.updatedAt
  const formatted = formatTimestamp(timestampSource)
  return {
    id: thread.id,
    projectId: thread.projectId,
    title: thread.title,
    preview: thread.preview,
    timestamp: formatted,
    relativeTimestamp: formatRelativeTime(timestampSource),
    model: thread.model,
    status: thread.status,
    statusLabel: getStatusLabel(thread.status),
    progressText: buildProgressText(thread.status, timestampSource),
    meta: `Model · ${thread.model}`
  }
}

function buildProgressText(status: AgentThread["status"], timestamp?: string) {
  const when = formatRelativeTime(timestamp)
  switch (status) {
    case "active":
      return when ? `Last update ${when}` : "Waiting for response"
    case "completed":
      return when ? `Completed ${when}` : "Completed"
    case "stopped":
      return when ? `Stopped ${when}` : "Stopped"
    case "failed":
      return when ? `Failed ${when}` : "Failed"
    default:
      return ""
  }
}

function getStatusLabel(status: AgentThread["status"]): string {
  switch (status) {
    case "active":
      return "In progress"
    case "completed":
      return "Completed"
    case "stopped":
      return "Stopped"
    case "failed":
      return "Failed"
    default:
      return status
  }
}

function formatRelativeTime(value?: string): string {
  if (!value) {
    return ""
  }
  const timestamp = new Date(value)
  if (Number.isNaN(timestamp.getTime())) {
    return ""
  }
  const now = new Date()
  const diffMs = timestamp.getTime() - now.getTime()

  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "seconds"],
    [60, "minutes"],
    [24, "hours"],
    [7, "days"],
    [4.34524, "weeks"],
    [12, "months"],
    [Number.POSITIVE_INFINITY, "years"]
  ]

  let duration = diffMs / 1000
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) {
      return relativeFormatter.format(Math.round(duration), unit)
    }
    duration /= amount
  }
  return ""
}
