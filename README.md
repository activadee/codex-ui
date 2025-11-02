# README

## About

Wails desktop app with a refactored backend following a modular internal/ layout.

You can configure the project by editing `wails.json`. More information about the project settings can be found
here: https://wails.io/docs/reference/project-config

## Live Development

To run in live development mode, run `wails dev` in the project directory. This will run a Vite development
server that will provide very fast hot reload of your frontend changes. If you want to develop in a browser
and have access to your Go methods, there is also a dev server that runs on http://localhost:34115. Connect
to this in your browser, and you can call your Go code from devtools.

## Backend Structure

- `internal/projects`: project service + Wails API
- `internal/agents`: agent service + Wails API (streams, threads, diffs, PRs)
- `internal/terminal`: PTY manager + Wails API
- `internal/attachments`: clipboard/image persistence API
- `internal/watchers`: per-thread FS watchers with debounced diff emission
- `internal/storage`: sqlite, migrations, repositories, app data path helper
- `internal/ui`: simple UI-related APIs (e.g., SelectProjectDirectory)
- `internal/git/worktrees`: git worktree manager
- `main.go`: composition root (opens DB, migrates, wires services, binds APIs)

## Build

- Generate Wails bindings: `wails generate module`
- Build Go backend: `go build ./...`
- Build frontend: `cd frontend && npm ci && npm run build`
