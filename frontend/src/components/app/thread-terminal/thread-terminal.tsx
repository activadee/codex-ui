import { Loader2, PowerIcon, RotateCcw } from "lucide-react"

import { WorkspacePanel } from "@/components/app/workspace-panel"
import { Button } from "@/components/ui/button"
import { useThreadTerminal } from "@/hooks/useThreadTerminal"

import { StatusBadge } from "./status-badge"
import { useTerminalViewport } from "./useTerminalViewport"

import "@xterm/xterm/css/xterm.css"

export type ThreadTerminalProps = {
  threadId?: number
}

export function ThreadTerminal({ threadId }: ThreadTerminalProps) {
  const { status, error, exitStatus, start, stop, send, resize, subscribe } = useThreadTerminal(threadId)
  const { containerRef } = useTerminalViewport({
    threadId,
    subscribe,
    resize,
    send
  })

  const statusLabel = (() => {
    switch (status) {
      case "connecting":
        return "Connecting"
      case "ready":
        return "Connected"
      case "exited":
        return exitStatus ? exitStatus : "Exited"
      case "error":
        return error ?? "Error"
      default:
        return "Idle"
    }
  })()

  const showSpinner = status === "connecting"
  const canRestart = status === "exited" || status === "error"

  return (
    <WorkspacePanel
      title="Terminal"
      actions={
        <div className="flex items-center gap-2 text-xs">
          <StatusBadge status={status} label={statusLabel} isBusy={showSpinner} />
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => void stop()}
            disabled={!threadId || status === "idle" || status === "connecting"}
            aria-label="Stop terminal"
          >
            <PowerIcon className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => void start()}
            disabled={!threadId || (!canRestart && status !== "idle")}
            aria-label="Restart terminal"
          >
            {showSpinner ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          </Button>
        </div>
      }
      bodyClassName="relative"
    >
      <div ref={containerRef} className="h-full w-full" />
      {!threadId && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-muted-foreground">
          Select a thread to open a terminal.
        </div>
      )}
    </WorkspacePanel>
  )
}
