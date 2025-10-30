type AlertTone = "info" | "error"

type WorkspaceAlert = {
  id: string
  message: string
  tone?: AlertTone
}

type WorkspaceAlertsProps = {
  alerts: WorkspaceAlert[]
}

export function WorkspaceAlerts({ alerts }: WorkspaceAlertsProps) {
  if (!alerts.length) {
    return null
  }

  return (
    <div className="flex flex-col gap-3">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={
            alert.tone === "error"
              ? "border border-destructive bg-destructive/10 px-4 py-3 text-sm text-destructive shadow-sm"
              : "border border-border bg-card px-4 py-3 text-sm text-muted-foreground shadow-sm"
          }
        >
          {alert.message}
        </div>
      ))}
    </div>
  )
}
