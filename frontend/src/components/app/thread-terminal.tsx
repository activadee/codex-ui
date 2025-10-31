import { Loader2, PowerIcon, RotateCcw } from "lucide-react"
import { useEffect, useMemo, useRef } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"

import { Button } from "@/components/ui/button"
import { useThreadTerminal } from "@/hooks/useThreadTerminal"
import { cn } from "@/lib/utils"

import "@xterm/xterm/css/xterm.css"

type ThreadTerminalProps = {
  threadId?: number
}

const terminalTheme = {
  background: "#0f172a",
  foreground: "#e2e8f0",
  cursor: "#38bdf8",
  selection: "rgba(148,163,184,0.35)",
  black: "#1e293b",
  blue: "#38bdf8",
  cyan: "#22d3ee",
  green: "#4ade80",
  magenta: "#f472b6",
  red: "#f87171",
  white: "#f8fafc",
  yellow: "#facc15"
}

export function ThreadTerminal({ threadId }: ThreadTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

  const { status, error, exitStatus, start, stop, send, resize, subscribe } = useThreadTerminal(threadId)
  const sendRef = useRef(send)

  const statusLabel = useMemo(() => {
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
  }, [error, exitStatus, status])

  useEffect(() => {
    sendRef.current = send
  }, [send])

  useEffect(() => {
    if (!containerRef.current || !threadId) {
      return
    }

    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      allowTransparency: true,
      screenReaderMode: false,
      theme: terminalTheme,
      fontFamily: "JetBrains Mono, Monaco, Consolas, 'Courier New', monospace",
      fontSize: 13,
      rows: 24
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)

    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    terminal.open(containerRef.current)
    tryFit(terminal, fitAddon, resize)

    const disposeOutput = subscribe((event) => {
      if (!terminalRef.current) {
        return
      }
      if (event.type === "output") {
        terminalRef.current.write(event.data)
      } else if (event.type === "ready") {
        terminalRef.current.clear()
      } else if (event.type === "exit") {
        terminalRef.current.write(`\r\n[process ${event.status ?? "exited"}]\r\n`)
      }
    })

    const dataListener = terminal.onData((data) => {
      void sendRef.current(data)
    })

    const resizeObserver = new ResizeObserver(() => {
      if (!terminalRef.current || !fitAddonRef.current) {
        return
      }
      tryFit(terminalRef.current, fitAddonRef.current, resize)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposeOutput()
      dataListener.dispose()
      resizeObserver.disconnect()
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
    }
  }, [resize, subscribe, threadId])

  useEffect(() => {
    if (!threadId && terminalRef.current) {
      terminalRef.current.clear()
    }
  }, [threadId])

  const showSpinner = status === "connecting"
  const canRestart = status === "exited" || status === "error"

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-border/60 bg-background/40">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">Terminal</span>
          <StatusBadge status={status} label={statusLabel} isBusy={showSpinner} />
        </div>
        <div className="flex items-center gap-2">
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
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
        {!threadId && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80 text-xs text-muted-foreground">
            Select a thread to open a terminal.
          </div>
        )}
      </div>
    </div>
  )
}

function StatusBadge({
  status,
  label,
  isBusy
}: {
  status: string
  label: string
  isBusy: boolean
}) {
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

function tryFit(terminal: Terminal, fitAddon: FitAddon, resize: (cols: number, rows: number) => Promise<void>) {
  try {
    fitAddon.fit()
    const cols = terminal.cols
    const rows = terminal.rows
    void resize(cols, rows)
  } catch (error) {
    console.error("Failed to fit terminal", error)
  }
}
