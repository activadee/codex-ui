# ProjectSidebar Component

## Location
`src/components/app/project-sidebar/index.tsx`

## Purpose
Renders the left sidebar listing projects and their threads. Provides UI for selecting/renaming/deleting threads and adding projects.

## Inputs (derived from workspace controller)
- Projects list + active project
- Thread sections (grouped via domain helpers)
- Loading flags for projects/threads
- Callbacks: `onProjectDelete`, `onAddProject`, `onNewThread`, `onThreadSelect`, `onThreadRename`, `onThreadDelete`

## Behavior
- Shows active project details and CTA buttons.
- Groups threads using the precomputed sections (In Progress, Older, Archived).
- Surfaces loading skeletons when `isLoadingProjects` or `isLoadingThreads` are true.

## Notes
- Stateless; all data/actions come from `workspace` controller hooks.
- Integrates with routing by calling the passed callbacks which ultimately drive the slices and router.
