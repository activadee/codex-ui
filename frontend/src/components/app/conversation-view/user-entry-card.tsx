import { User } from "lucide-react"

import type { UserConversationEntry } from "@/types/app"

import { formatTime } from "./utils"

type UserEntryCardProps = {
  entry: UserConversationEntry
}

export function UserEntryCard({ entry }: UserEntryCardProps) {
  const timestamp = formatTime(entry.createdAt)

  return (
    <article className="min-w-0 w-full max-w-full overflow-hidden rounded-xl border border-border/60 bg-white px-4 py-3 shadow-sm">
      <header className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          <User className="h-4 w-4" aria-hidden /> You
        </span>
        <time className="shrink-0 text-[11px] tracking-wide text-muted-foreground/80">{timestamp}</time>
      </header>
      <div className="mt-2 max-w-full space-y-2 text-sm text-foreground">
        {entry.text && <p className="whitespace-pre-wrap wrap-break-word leading-relaxed">{entry.text}</p>}
      </div>
    </article>
  )
}
