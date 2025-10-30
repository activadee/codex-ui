import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  ListChecks,
  Loader2,
  LucideIcon,
  MessageSquareText,
  Search,
  Sparkles,
  TerminalSquare,
  User
} from "lucide-react"

import { cn } from "@/lib/utils"
import type {
  AgentConversationEntry,
  ConversationEntry,
  SystemConversationEntry,
  UserConversationEntry
} from "@/types/app"

type ConversationViewProps = {
  entries: ConversationEntry[]
  isStreaming: boolean
  streamStatus: string
  projectName: string
}

export function ConversationView({ entries, isStreaming, streamStatus, projectName }: ConversationViewProps) {
  const hasContent = entries.length > 0

  if (!hasContent && !isStreaming) {
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 px-8 py-8 text-center text-sm text-muted-foreground">
        <Sparkles className="h-5 w-5" />
        <p>Open or start a conversation for {projectName} to see activity.</p>
      </div>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 overflow-hidden">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 md:px-8 md:py-8">
            <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
              {entries.map((entry) => (
                <ConversationEntryCard key={entry.id} entry={entry} />
              ))}
              {isStreaming && <StreamingIndicator status={streamStatus} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type ConversationEntryCardProps = {
  entry: ConversationEntry
}

function ConversationEntryCard({ entry }: ConversationEntryCardProps) {
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

function UserEntryCard({ entry }: { entry: UserConversationEntry }) {
  const timestamp = formatTime(entry.createdAt)

  return (
    <article className="min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-border/60 bg-white/70 px-5 py-4 shadow-sm">
      <header className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <User className="h-4 w-4" aria-hidden /> You
        </span>
        <time className="shrink-0 text-[11px] tracking-wide text-muted-foreground/80">{timestamp}</time>
      </header>
      <div className="mt-3 max-w-full space-y-3 text-sm text-foreground">
        {entry.text && <p className="whitespace-pre-wrap break-words leading-relaxed">{entry.text}</p>}
      </div>
    </article>
  )
}

function AgentEntryCard({ entry }: { entry: AgentConversationEntry }) {
  const timestamp = formatTime(entry.updatedAt)
  const { item } = entry

  const sharedClasses = "min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-primary/30 bg-primary/5 px-5 py-4 shadow-sm"
  const Icon = selectAgentIcon(item.type)
  const label = agentLabel(item.type)

  return (
    <article className={sharedClasses}>
      <header className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.28em] text-primary">
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4" aria-hidden />}
          {label}
        </span>
        <time className="shrink-0 text-[11px] tracking-wide text-muted-foreground/80">{timestamp}</time>
      </header>
      <div className="mt-3 max-w-full space-y-3 text-sm text-foreground">
        {renderAgentContent(item)}
      </div>
    </article>
  )
}

function SystemEntryCard({ entry }: { entry: SystemConversationEntry }) {
  const timestamp = formatTime(entry.createdAt)
  const isError = entry.tone === "error"

  return (
    <div
      className={cn(
        "flex min-w-0 w-full max-w-full items-center justify-between overflow-hidden rounded-xl border px-4 py-3 text-xs font-medium",
        isError ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-muted bg-muted/70 text-muted-foreground"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {isError ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
        <span className="break-words">{entry.message}</span>
      </span>
      <time className="shrink-0 text-[11px] tracking-wide text-muted-foreground/80">{timestamp}</time>
    </div>
  )
}

function StreamingIndicator({ status }: { status: string }) {
  const label = status === "streaming" ? "Assistant responding" : status
  return (
    <div className="flex min-w-0 w-full max-w-full items-center gap-3 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs font-medium text-primary">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="break-words">{label}</span>
    </div>
  )
}

function renderAgentContent(item: AgentConversationEntry["item"]) {
  switch (item.type) {
    case "agent_message":
      if (item.text) {
        return <p className="whitespace-pre-wrap break-words leading-relaxed">{item.text}</p>
      }
      return null
    case "reasoning":
      if (!item.reasoning) {
        return null
      }
      return (
        <div className="max-w-full rounded-lg border border-primary/30 bg-white/70 px-4 py-3 text-xs text-muted-foreground">
          {item.reasoning.split("\n").map((line, idx) => (
            <p key={idx} className="break-words">
              {line}
            </p>
          ))}
        </div>
      )
    case "command_execution":
      if (!item.command) {
        return null
      }
      return (
        <div className="max-w-full space-y-2 text-xs">
          <div className="flex min-w-0 items-center gap-2 font-semibold text-foreground">
            <TerminalSquare className="h-3.5 w-3.5" />
            <span className="break-all">{item.command.command}</span>
          </div>
          {item.command.aggregatedOutput && (
            <pre className="max-h-60 w-full overflow-x-auto overflow-y-auto rounded-md bg-black/80 px-3 py-2 font-mono text-[11px] leading-snug text-white/90">
              {item.command.aggregatedOutput.trim()}
            </pre>
          )}
          <CommandStatus status={item.command.status} exitCode={item.command.exitCode} />
        </div>
      )
    case "file_change":
      if (!item.fileDiffs || item.fileDiffs.length === 0) {
        return null
      }
      return (
        <ul className="max-w-full space-y-2 text-xs">
          {item.fileDiffs.map((diff, idx) => (
            <li key={`${diff.path}-${idx}`} className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-white/80 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 text-foreground">
                <FileText className="h-3.5 w-3.5" />
                <span className="break-all">{diff.path}</span>
              </span>
              <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">
                {diff.kind} · {diff.status}
              </span>
            </li>
          ))}
        </ul>
      )
    case "mcp_tool_call":
      if (!item.toolCall) {
        return null
      }
      return (
        <div className="flex max-w-full flex-col gap-1 text-xs">
          <div className="flex min-w-0 items-center gap-2 text-foreground">
            <ListChecks className="h-3.5 w-3.5" />
            <span className="break-all">
              {item.toolCall.server} · {item.toolCall.tool}
            </span>
          </div>
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.toolCall.status}</span>
        </div>
      )
    case "web_search":
      if (!item.webSearch) {
        return null
      }
      return (
        <div className="flex min-w-0 max-w-full items-center gap-2 text-xs text-foreground">
          <Search className="h-3.5 w-3.5" />
          <span className="break-words">{item.webSearch.query}</span>
        </div>
      )
    case "todo_list":
      if (!item.todoList) {
        return null
      }
      return (
        <ul className="space-y-1 text-xs text-foreground max-w-full">
          {item.todoList.items.map((todo, idx) => (
            <li key={`${todo.text}-${idx}`} className="flex min-w-0 items-center gap-2">
              <CheckCircle2 className={cn("h-3.5 w-3.5", todo.completed ? "text-primary" : "text-muted-foreground/60")} />
              <span className={cn("break-words", todo.completed ? "line-through text-muted-foreground" : undefined)}>{todo.text}</span>
            </li>
          ))}
        </ul>
      )
    case "error":
      if (!item.error) {
        return null
      }
      return (
        <div className="flex min-w-0 items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive max-w-full">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="break-words">{item.error.message}</span>
        </div>
      )
    default:
      return (
        <div className="text-xs text-muted-foreground">
          Unsupported item type <code className="rounded bg-muted px-1 py-0.5 text-[11px]">{item.type}</code>
        </div>
      )
  }
}

function CommandStatus({ status, exitCode }: { status: string; exitCode?: number | null }) {
  const normalized = status.toLowerCase()
  const code = typeof exitCode === "number" ? ` · exit ${exitCode}` : ""
  return (
    <span className="inline-block rounded-full bg-primary/10 px-2 py-1 text-[11px] uppercase tracking-wide text-primary">
      {normalized}
      {code}
    </span>
  )
}

function agentLabel(type: string): string {
  switch (type) {
    case "agent_message":
      return "Assistant"
    case "reasoning":
      return "Reasoning"
    case "command_execution":
      return "Command"
    case "file_change":
      return "File change"
    case "mcp_tool_call":
      return "Tool call"
    case "web_search":
      return "Web search"
    case "todo_list":
      return "To-do list"
    case "error":
      return "Error"
    default:
      return type
  }
}

function selectAgentIcon(type: string): LucideIcon | null {
  switch (type) {
    case "agent_message":
      return Sparkles
    case "reasoning":
      return MessageSquareText
    case "command_execution":
      return TerminalSquare
    case "file_change":
      return FileText
    case "mcp_tool_call":
      return ListChecks
    case "web_search":
      return Search
    case "todo_list":
      return ListChecks
    case "error":
      return AlertTriangle
    default:
      return Sparkles
  }
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ""
  }
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
}
