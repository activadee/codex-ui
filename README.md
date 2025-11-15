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

## Agent Models & Codex CLI

- codex-ui targets Codex CLI `rust-v0.58.0` or newer so the GPT-5.1 family (`gpt-5.1-codex`, `gpt-5.1-codex-mini`, `gpt-5.1`) is available everywhere the composer exposes model choices.
- The composer defaults to `gpt-5.1-codex` with a Medium reasoning level to match the upstream presets, but you can still pick legacy GPT-5 options when needed.

## Build

- Generate Wails bindings: `wails generate module`
- Build Go backend: `go build ./...`
- Build frontend: `cd frontend && npm ci && npm run build`

## Doc Sync Workflow

- `.github/workflows/doc-sync.yml` reuses `activadee/codex-shared-workflows/.github/workflows/doc-sync.yml@main` to keep Markdown + `docs/**` files aligned with each PR.
- The workflow now triggers automatically on `pull_request` events (`opened`, `synchronize`, `reopened`) when the actor matches the repository owner, so repo-owned branches get doc checks without leaving comments.
- Maintainers can also press **Run workflow** from the Actions tab (the workflow has `workflow_dispatch` enabled) to retrigger the sync for community PRs or after manual fixes.
- `doc_globs` is pinned to `README.md`, `AGENTS.md`, and `docs/**/*.md`, and the job has `contents` + `pull-requests` write permissions so it can commit `[skip ci][doc-sync]` updates directly back to the PR branch.
