# FilesPanel Component

## Location
`src/components/app/files-panel.tsx`

## Purpose
Displays per-thread file diff stats and PR actions. Consumes the diffs feature hook and threads slice actions.

## Data Flow
1. Calls `useThreadFileDiffs(threadId)` to fetch/select diffs.
2. Uses `useAppStore` selectors for `refreshThread` + `createPullRequest` so it can refresh PR metadata and trigger PR creation.
3. Uses `runtimeServices.openExternal` to open PR URLs.

## Behavior
- Shows diff counts with added/removed lines.
- Offers “Create PR” / “Open PR” buttons depending on `prUrl` state.
- Provides manual refresh button (calls `refresh()` from the hook).
- Displays action and load errors inline.

## Notes
- Diff state lives entirely in the slice; the component never touches the bridge directly.
- Pending PR creation state (`isCreatingPr`) lives locally since it is component-specific UI concern.
