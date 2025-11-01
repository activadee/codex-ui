import { useWorkspaceRouteContext } from "@/routes/workspace-context"

export default function ProjectLanding() {
  const { workspace } = useWorkspaceRouteContext()
  const hasThreads = workspace.threads.sections.some((section) => section.threads.length > 0)

  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 py-12 text-center text-sm text-muted-foreground">
      <div className="bg-card px-6 py-8 shadow-sm">
        <p className="font-medium text-foreground">
          {hasThreads ? "Select a conversation to continue." : "No conversations yet for this project."}
        </p>
        <p className="mt-2 text-muted-foreground">
          {hasThreads
            ? "Pick a thread from the sidebar or start a new one with the composer."
            : "Start a new conversation to begin working with this project."}
        </p>
      </div>
    </div>
  )
}
