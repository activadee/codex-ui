import { AlertTriangle, Sparkles } from "lucide-react"

import { cn } from "@/lib/utils"
import type { SystemConversationEntry } from "@/types/app"

import { formatTime } from "./utils"

type SystemEntryCardProps = {
  entry: SystemConversationEntry
}

export function SystemEntryCard({ entry }: SystemEntryCardProps) {
  const timestamp = formatTime(entry.createdAt)
  const isError = entry.tone === "error"

  return (
    <div
      className={cn(
        "flex min-w-0 w-full max-w-full items-center justify-between overflow-hidden rounded-xl border px-3 py-2 text-xs font-medium",
        isError ? "border-destructive/40 bg-destructive/10 text-destructive" : "border-muted bg-muted/60 text-muted-foreground"
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        {isError ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
        <span className="wrap-break-word">{entry.message}</span>
      </span>
      <time className="shrink-0 text-[11px] tracking-wide text-muted-foreground/80">{timestamp}</time>
    </div>
  )
}
