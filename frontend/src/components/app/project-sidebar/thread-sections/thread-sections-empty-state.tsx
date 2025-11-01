export function EmptyThreadState({ hasProject }: { hasProject: boolean }) {
  return (
    <div className="flex flex-1 min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed border-border/70 bg-muted/40 px-4 text-center">
      <p className="text-sm font-medium text-foreground">
        {hasProject ? "No conversations yet" : "Select a project"}
      </p>
      <p className="text-xs text-muted-foreground">
        {hasProject
          ? "Once Codex ingests sessions for this workspace, they’ll show up here."
          : "Pick a project or add a new one to start tracking conversations."}
      </p>
    </div>
  )
}
