import { BadgeCheck, Radio } from "lucide-react"

import type { AgentThread } from "@/types/app"

type ConversationHeaderProps = {
  thread?: AgentThread | null
  projectName?: string
}

export function ConversationHeader({
  thread,
  projectName
}: ConversationHeaderProps) {
  const statusLabel = thread ? getStatusLabel(thread.status) : "Draft"
  const updatedAt = thread?.lastMessageAt ?? thread?.updatedAt
  const updatedRelative = formatRelativeTime(updatedAt)

  return (
    <div className=" bg-card px-8 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-muted-foreground">{projectName ?? "Workspace"}</p>
          <h1 className="text-2xl font-semibold leading-tight text-foreground">
            {thread?.title ?? "Start a new conversation"}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Radio className="h-3.5 w-3.5" />
              {statusLabel}
            </span>
            {updatedRelative && (
              <span className="flex items-center gap-1">
                <BadgeCheck className="h-3.5 w-3.5" />
                Updated {updatedRelative}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function getStatusLabel(status: AgentThread["status"] | undefined): string {
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
      return "Idle"
  }
}

function formatSandbox(value?: string) {
  if (!value) {
    return "Workspace"
  }
  switch (value) {
    case "workspace-write":
      return "Workspace Write"
    case "read-only":
      return "Read Only"
    case "danger-full-access":
      return "Full Access"
    default:
      return value
  }
}

function formatReasoning(value?: string) {
  if (!value) {
    return "Default"
  }
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatRelativeTime(value?: string) {
  if (!value) {
    return ""
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  const formatter = new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto"
  })
  const diff = date.getTime() - Date.now()
  const divisions: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, "seconds"],
    [60, "minutes"],
    [24, "hours"],
    [7, "days"],
    [4.34524, "weeks"],
    [12, "months"],
    [Number.POSITIVE_INFINITY, "years"]
  ]

  let duration = diff / 1000
  for (const [amount, unit] of divisions) {
    if (Math.abs(duration) < amount) {
      return formatter.format(Math.round(duration), unit)
    }
    duration /= amount
  }
  return ""
}
