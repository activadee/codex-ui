package main

import (
	"context"
	"embed"
	"log"
	"path/filepath"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/linux"

	"codex-ui/internal/agents"
	"codex-ui/internal/attachments"
	"codex-ui/internal/projects"
	"codex-ui/internal/storage"
	"codex-ui/internal/storage/discovery"
	"codex-ui/internal/storage/migrate"
	"codex-ui/internal/storage/sqlite"
	term "codex-ui/internal/terminal"
	"codex-ui/internal/ui"
	"codex-ui/internal/watchers"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()

	// Wire storage & services (like go-kanban)
	dataDir, err := storage.DataDir()
	if err != nil {
		log.Fatalf("data dir: %v", err)
	}
	dbPath := filepath.Join(dataDir, "catalog.db")
	db, err := sqlite.Open(dbPath)
	if err != nil {
		log.Fatalf("open sqlite: %v", err)
	}
	if err := migrate.Up(db); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	// Repository & services
	repo := discovery.NewRepository(db)
	app.db = db
	app.repo = repo
	app.projectService = projects.NewService(repo)
	agentService, err := agents.BootstrapService(dataDir, repo)
	if err != nil {
		log.Fatalf("init agent service: %v", err)
	}
	app.agentService = agentService

	// Domain APIs
	projectsAPI := projects.NewAPI(app.projectService)
	watcherSvc := watchers.New(nil)
	agentsAPI := agents.NewAPI(app.agentService, repo, watcherSvc, app.Context)
	watcherSvc.SetEmitter(agentsAPI.EmitThreadDiffUpdate)
	termMgr := term.NewManager(app.agentService, app.Context, "")
	termAPI := term.NewAPI(termMgr)
	attachAPI := attachments.NewAPI()
	uiAPI := ui.NewAPI(app.Context)

	// Create application with options
	err = wails.Run(&options.App{
		Title:  "codex-ui",
		Width:  1920,
		Height: 1080,
		Linux: &linux.Options{
			WebviewGpuPolicy: linux.WebviewGpuPolicyAlways,
		},
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		OnShutdown: func(ctx context.Context) {
			// graceful shutdown of services
			if app.agentService != nil {
				app.agentService.StopWorktreeCleanup()
			}
			if watcherSvc != nil {
				watcherSvc.Stop()
			}
			if termMgr != nil {
				termMgr.CloseAll()
			}
			if app.db != nil {
				_ = app.db.Close()
			}
		},
		Bind: []interface{}{projectsAPI, agentsAPI, termAPI, attachAPI, uiAPI},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
