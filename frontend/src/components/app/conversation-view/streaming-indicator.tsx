import { Loader2 } from "lucide-react"

type StreamingIndicatorProps = {
  status: string
}

export function StreamingIndicator({ status }: StreamingIndicatorProps) {
  const label = status === "streaming" ? "Assistant responding" : status

  return (
    <div className="flex min-w-0 w-full max-w-full items-center gap-2 overflow-hidden rounded-xl border border-primary/20 bg-primary/10 px-3 py-2 text-xs font-medium text-primary">
      <Loader2 className="h-4 w-4 animate-spin" />
      <span className="wrap-break-word">{label}</span>
    </div>
  )
}
