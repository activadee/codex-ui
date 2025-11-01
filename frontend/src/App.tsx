import { Navigate, Outlet, Route, Routes, useOutletContext } from "react-router-dom"

import WorkspaceLayout from "@/routes/WorkspaceLayout"
import WorkspaceLanding from "@/routes/WorkspaceLanding"
import ProjectLanding from "@/routes/ProjectLanding"
import NewThreadRoute from "@/routes/NewThreadRoute"
import ThreadRoute from "@/routes/ThreadRoute"
import type { WorkspaceRouteContextValue } from "@/routes/workspace-context"

function ProjectOutletBridge() {
  const context = useOutletContext<WorkspaceRouteContextValue>()
  return <Outlet context={context} />
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorkspaceLayout />}>
        <Route index element={<WorkspaceLanding />} />
        <Route path="projects/:projectId" element={<ProjectOutletBridge />}>
          <Route index element={<ProjectLanding />} />
          <Route path="threads">
            <Route path="new" element={<NewThreadRoute />} />
            <Route path=":threadId" element={<ThreadRoute />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
