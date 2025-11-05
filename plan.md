# Project Discovery & Catalog Feature Plan

## Goal
Provide the desktop UI with a reliable list of Codex workspaces/projects, including metadata (path, display name, recency, tags) and the ability to evolve into richer state (sessions, messages) later.

## High-Level Milestones

1. **Storage Foundation (SQLite via modernc.org/sqlite)**
   - Add dependency: `modernc.org/sqlite` and migration tool (e.g., `atlas` or `goose`).
   - Create schema migration for `projects` table:
     - `id` (INTEGER PRIMARY KEY)
     - `path` (TEXT UNIQUE NOT NULL)
     - `display_name` (TEXT)
     - `tags` (TEXT, JSON-encoded list for now)
     - `last_opened_at` (TIMESTAMP NULL)
     - `created_at`, `updated_at`
   - Optionally, prep `project_events` or `project_sessions` table for future use.

2. **Repository Layer**
   - `internal/storage/discovery` package.
   - Functions:
     - `Init(ctx)` / `Migrate(ctx)`
     - `ListProjects(ctx) ([]Project, error)`
     - `GetProjectByPath(ctx, path string) (Project, bool, error)`
     - `UpsertProject(ctx, Project) error` (handles new or updates)
     - `DeleteProject(ctx, id int64) error`
   - Unit tests using in-memory SQLite (modernc supports `file::memory:?cache=shared`).

3. **Wails Backend Bindings**
   - New service layer (e.g., `internal/projects`) that:
     - wraps repository calls
     - handles domain validation (unique path, deriving display name, etc.)
   - Expose Wails methods:
     - `ProjectsList() ([]ProjectDTO, error)`
     - `ProjectsRegister(path string, metadata ProjectMetadata) (ProjectDTO, error)`
     - `ProjectsRemove(id int64) error`
     - `ProjectsMarkOpened(id int64) error`
   - DTOs mirroring UI requirements (string IDs optional).

4. **Session Discovery Integration (optional for v1)**
   - Build scanner to read `.codex/sessions/*.jsonl` and populate/update projects.
   - Strategy:
     - On launch, tail JSONL files, derive workspace path.
     - Update catalog via repository (upsert, set `last_opened_at`).
     - Remember file offsets to avoid reprocessing entire files (store offsets in DB or sidecar table like `session_offsets`).
   - Hook into a background goroutine; provide manual refresh via Wails method.

5. **Frontend Integration (future milestone)**
   - Update React app to call new bindings on startup.
   - Allow user to add/remove/pin projects (calls register/delete endpoints).
   - Display last-opened timestamps and tags.

## Notes & Decisions
* **Migrations**: even if only one table initially, include a migration tool in the workflow so further schema changes don’t require ad-hoc SQL.
* **ORM**: defer using a full ORM; stick to `database/sql` with repository layer. Revisit after data model expands (messages, runs, etc.).
* **Metadata Extensibility**: keep `tags` and other JSON fields simple now; can normalize later.
* **Session Logs vs. Catalog**: primary source becomes the SQLite catalog. Session discovery augments it but isn’t required for initial feature.

## Next Steps
1. Add `plan.md` to repo (this file).
2. Introduce migration tool, create initial migration.
3. Implement `internal/storage/discovery` and repository tests.
4. Wire service + Wails bindings.
5. (Optional) Session log scanner + background updater.
6. Update frontend to consume new backend API.
