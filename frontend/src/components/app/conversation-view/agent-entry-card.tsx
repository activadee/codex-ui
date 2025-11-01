import { AlertTriangle, CheckCircle2, FileText, ListChecks, MessageSquareText, Search, Sparkles, TerminalSquare } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import type { AgentConversationEntry } from "@/types/app"

import { formatTime } from "./utils"

type AgentEntryCardProps = {
  entry: AgentConversationEntry
}

export function AgentEntryCard({ entry }: AgentEntryCardProps) {
  const timestamp = formatTime(entry.updatedAt)
  const { item } = entry

  const sharedClasses = "min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-sm"
  const Icon = selectAgentIcon(item.type)
  const label = agentLabel(item.type)

  return (
    <article className={sharedClasses}>
      <header className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
        <span className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="h-4 w-4" aria-hidden />}
          {label}
        </span>
        <time className="shrink-0 text-[11px] tracking-wide text-muted-foreground/80">{timestamp}</time>
      </header>
      <div className="mt-2 max-w-full space-y-2 text-sm text-foreground">{renderAgentContent(item)}</div>
    </article>
  )
}

function renderAgentContent(item: AgentConversationEntry["item"]) {
  switch (item.type) {
    case "agent_message":
      if (item.text) {
        return <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{item.text}</p>
      }
      return null
    case "reasoning":
      if (!item.reasoning) {
        return null
      }
      return (
        <div className="max-w-full rounded-lg border border-primary/30 bg-white/70 px-4 py-3 text-xs text-muted-foreground">
          {item.reasoning.split("\n").map((line, idx) => (
            <p key={idx} className="wrap-break-word">
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
            <li
              key={`${diff.path}-${idx}`}
              className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-white/80 px-3 py-2"
            >
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
          <span className="wrap-break-word">{item.webSearch.query}</span>
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
              <CheckCircle2
                className={cn("h-3.5 w-3.5", todo.completed ? "text-primary" : "text-muted-foreground/60")}
              />
              <span className={cn("wrap-break-word", todo.completed ? "line-through text-muted-foreground" : undefined)}>
                {todo.text}
              </span>
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
          <span className="wrap-break-word">{item.error.message}</span>
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
