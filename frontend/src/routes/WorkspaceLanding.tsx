export default function WorkspaceLanding() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center px-8 py-12 text-center text-sm text-muted-foreground">
      <div className="bg-card px-6 py-8 shadow-sm">
        <p className="font-medium text-foreground">Select a project to get started.</p>
        <p className="mt-2 text-muted-foreground">
          Choose a workspace from the sidebar to view conversations and send messages.
        </p>
      </div>
    </div>
  )
}
