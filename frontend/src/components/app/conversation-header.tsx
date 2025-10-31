import type { ReactNode } from "react"

import { BadgeCheck, Cpu, Radio, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
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
  const sandboxLabel = thread ? formatSandbox(thread.sandboxMode) || null : null
  const reasoningLabel = thread ? formatReasoning(thread.reasoningLevel) || null : null
  const modelLabel = thread?.model ?? null
  const statusTone = getStatusTone(thread?.status)
  const metaItems = [
    modelLabel ? { icon: <Cpu className="h-3.5 w-3.5" />, label: modelLabel } : null,
    sandboxLabel ? { icon: <Sparkles className="h-3.5 w-3.5" />, label: sandboxLabel } : null,
    reasoningLabel ? { icon: <Sparkles className="h-3.5 w-3.5" />, label: reasoningLabel } : null
  ].filter(Boolean) as Array<{ icon: ReactNode; label: string }>

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
      <span className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground/80">
        {projectName ?? "Workspace"}
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 transition-colors",
          statusTone
        )}
      >
        <Radio className="h-3.5 w-3.5" />
        {statusLabel}
      </span>
      {updatedRelative && (
        <span className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-1">
          <BadgeCheck className="h-3.5 w-3.5" />
          {updatedRelative}
        </span>
      )}
      {metaItems.map(({ icon, label }) => (
        <span
          key={label}
          className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-background/70 px-2.5 py-1"
        >
          {icon}
          {label}
        </span>
      ))}
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
    return ""
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
    return ""
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

function getStatusTone(status: AgentThread["status"] | undefined) {
  switch (status) {
    case "active":
      return "border-sky-300/60 bg-sky-500/10 text-sky-600"
    case "completed":
      return "border-emerald-300/60 bg-emerald-500/10 text-emerald-600"
    case "failed":
      return "border-rose-300/60 bg-rose-500/10 text-rose-600"
    case "stopped":
      return "border-amber-300/60 bg-amber-500/10 text-amber-600"
    default:
      return "border-border/60 bg-muted/60 text-muted-foreground"
  }
}
