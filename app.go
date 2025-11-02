package main

import (
	"context"
	"database/sql"

	"codex-ui/internal/agents"
	"codex-ui/internal/projects"
	"codex-ui/internal/storage/discovery"
)

// App provides shared state for bindings that need application context.
type App struct {
	ctx context.Context

	db             *sql.DB
	repo           *discovery.Repository
	projectService *projects.Service
	agentService   *agents.Service
}

func NewApp() *App { return &App{} }

func (a *App) startup(ctx context.Context) { a.ctx = ctx }

// Context exposes the Wails runtime context to dependent services.
func (a *App) Context() context.Context { return a.ctx }
