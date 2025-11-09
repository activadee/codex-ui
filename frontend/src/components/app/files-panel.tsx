import { Loader2, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { WorkspacePanel } from "@/components/app/workspace-panel"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useThreadFileDiffs } from "@/hooks/useThreadFileDiffs"
import { BrowserOpenURL } from "../../../wailsjs/runtime/runtime"
import { agents } from "../../../wailsjs/go/models"
import { platformBridge } from "@/platform/wailsBridge"

type FilesPanelProps = {
  threadId?: number
}

export function FilesPanel({ threadId }: FilesPanelProps) {
  const { files, isLoading, error, refresh } = useThreadFileDiffs(threadId)
  const [isCreatingPr, setIsCreatingPr] = useState(false)
  const [prUrl, setPrUrl] = useState<string | undefined>(undefined)
  const [actionError, setActionError] = useState<string | null>(null)

  const handleRefresh = useCallback(() => {
    void refresh()
  }, [refresh])

  const title = files.length > 0 ? `Files (${files.length})` : "Files"
  useEffect(() => {
    let active = true
    async function loadThread() {
      setActionError(null)
      if (!threadId) {
        setPrUrl(undefined)
        return
      }
      try {
        const dto: agents.ThreadDTO = await platformBridge.threads.get(threadId)
        if (!active) return
        setPrUrl(dto?.prUrl ?? undefined)
      } catch (e) {
        if (!active) return
        // Non-fatal for showing buttons
      }
    }
    void loadThread()
    return () => {
      active = false
    }
  }, [threadId])

  const handleCreatePR = useCallback(async () => {
    if (!threadId) return
    setIsCreatingPr(true)
    setActionError(null)
    try {
      const url = await platformBridge.threads.createPullRequest(threadId)
      setPrUrl(url)
      void refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create PR"
      setActionError(msg)
    } finally {
      setIsCreatingPr(false)
    }
  }, [threadId, refresh])

  return (
    <WorkspacePanel
      title={title}
      actions={
        <div className="flex items-center gap-1">
          {prUrl ? (
            <Button
              size="sm"
              variant="default"
              className="h-7"
              onClick={() => prUrl && BrowserOpenURL(prUrl)}
              disabled={!threadId}
            >
              Open PR
            </Button>
          ) : files.length > 0 && threadId ? (
            <Button
              size="sm"
              variant="default"
              className="h-7"
              onClick={handleCreatePR}
              disabled={isLoading || isCreatingPr}
            >
              {isCreatingPr ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Creating…</span>
              ) : (
                "Create PR"
              )}
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={handleRefresh}
            disabled={isLoading || !threadId || isCreatingPr}
            aria-label="Refresh file changes"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      }
      bodyClassName="px-3 py-3 text-sm text-foreground"
    >
      <div className="h-full overflow-y-auto">
        {actionError ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive mb-2">
            {actionError}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : files.length === 0 ? (
          <EmptyState isLoading={isLoading} hasThread={Boolean(threadId)} />
        ) : (
          <ul className="space-y-2">
            {files.map((file) => (
              <li
                key={file.path}
                className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border/50 bg-background/60 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-sm text-foreground">{file.path}</p>
                  {file.status && (
                    <p className="mt-0.5 text-xs uppercase tracking-wide text-muted-foreground">{file.status}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <span className={cn("text-emerald-600", file.added === 0 && "text-muted-foreground/70")}>+{file.added}</span>
                  <span className={cn("text-rose-600", file.removed === 0 && "text-muted-foreground/70")}>-{file.removed}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </WorkspacePanel>
  )
}

function EmptyState({ isLoading, hasThread }: { isLoading: boolean; hasThread: boolean }) {
  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Fetching changes…
      </div>
    )
  }
  if (!hasThread) {
    return <p className="text-xs text-muted-foreground">Select a thread to see file updates.</p>
  }
  return <p className="text-xs text-muted-foreground">No file changes detected for this thread.</p>
}
