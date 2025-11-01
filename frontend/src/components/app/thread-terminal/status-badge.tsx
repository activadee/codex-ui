import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

type StatusBadgeProps = {
  status: string
  label: string
  isBusy: boolean
}

export function StatusBadge({ status, label, isBusy }: StatusBadgeProps) {
  const intent = (() => {
    switch (status) {
      case "ready":
        return "text-emerald-500"
      case "exited":
        return "text-amber-500"
      case "error":
        return "text-rose-500"
      case "connecting":
        return "text-sky-500"
      default:
        return "text-muted-foreground"
    }
  })()

  return (
    <span className={cn("flex items-center gap-1 text-xs font-medium", intent)}>
      {isBusy && <Loader2 className="h-3 w-3 animate-spin" />} {label}
    </span>
  )
}
