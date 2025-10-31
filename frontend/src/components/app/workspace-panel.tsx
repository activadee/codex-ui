import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type WorkspacePanelProps = {
  title: string
  headerClassName?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}

export function WorkspacePanel({
  title,
  actions,
  children,
  className,
  headerClassName,
  bodyClassName
}: WorkspacePanelProps) {
  return (
    <div className={cn("flex h-full flex-col overflow-hidden border border-border/60 bg-background/40", className)}>
      <div className={cn("flex h-10 shrink-0 items-center justify-between border-b border-border/60 px-3", headerClassName)}>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {actions}
      </div>
      <div className={cn("flex-1 min-h-0 overflow-hidden", bodyClassName)}>{children}</div>
    </div>
  )
}
