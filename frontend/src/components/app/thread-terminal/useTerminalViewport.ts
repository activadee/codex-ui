import { useCallback, useEffect, useRef } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal } from "@xterm/xterm"

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

type TerminalEvent =
  | { type: "output"; data: Uint8Array }
  | { type: "ready" }
  | { type: "exit"; status?: string }

type TerminalViewportOptions = {
  threadId?: number
  subscribe: (listener: (event: TerminalEvent) => void) => () => void
  resize: (cols: number, rows: number) => Promise<void>
  send: (data: string) => Promise<void>
}

export function useTerminalViewport({ threadId, subscribe, resize, send }: TerminalViewportOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const lastSizeRef = useRef<{ cols: number; rows: number } | null>(null)
  const resizeFrameRef = useRef<number | null>(null)
  const sendRef = useRef(send)

  const scheduleFit = useCallback(() => {
      if (!terminalRef.current || !fitAddonRef.current) {
        return
      }

      const runFit = () => {
        if (!terminalRef.current || !fitAddonRef.current) {
          return
        }
        try {
          fitAddonRef.current.fit()
        } catch (error) {
          console.error("Failed to fit terminal", error)
          return
        }
        const cols = terminalRef.current.cols
        const rows = terminalRef.current.rows
        const lastSize = lastSizeRef.current
        if (!lastSize || lastSize.cols !== cols || lastSize.rows !== rows) {
          lastSizeRef.current = { cols, rows }
          void resize(cols, rows)
        }
      }

      if (resizeFrameRef.current !== null) {
        return
      }

      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null
        runFit()
      })
    },
    [resize]
  )

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
    lastSizeRef.current = null

    terminal.open(containerRef.current)
    scheduleFit()

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
      scheduleFit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      disposeOutput()
      dataListener.dispose()
      resizeObserver.disconnect()
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      terminal.dispose()
      terminalRef.current = null
      fitAddonRef.current = null
      lastSizeRef.current = null
    }
  }, [resize, scheduleFit, subscribe, threadId])

  useEffect(() => {
    if (!threadId && terminalRef.current) {
      terminalRef.current.clear()
    }
  }, [threadId])

  return { containerRef }
}
