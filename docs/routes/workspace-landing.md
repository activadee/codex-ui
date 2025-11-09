# WorkspaceLanding Route

## Path
`/`

## Purpose
Fallback view rendered when no project is selected yet. It simply instructs the user to pick a project from the sidebar.

## Details
- Stateless functional component; no hooks or store selectors.
- Rendered by `WorkspaceLayout` when `workspace.projects.active` is `null` and the router hasn’t redirected to a project path yet.
- Provides consistent styling via the workspace shell (centered callout).
