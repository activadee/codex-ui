package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"os"
	"path/filepath"
	goruntime "runtime"
	"strings"

	"codex-ui/internal/services/agents"
	"codex-ui/internal/services/projects"
	"codex-ui/internal/storage/discovery"
	"codex-ui/internal/storage/migrate"
	"codex-ui/internal/storage/sqlite"
	"codex-ui/internal/worktrees"
	"time"

	"github.com/google/uuid"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	appDataDirName     = "codex-ui"
	legacyDataDirName  = "data"
	legacyDatabaseName = "catalog.db"
	attachmentsDirName = "attachments"
)

// App struct
type App struct {
	ctx            context.Context
	db             *sql.DB
	repo           *discovery.Repository
	projectService *projects.Service
	agentService   *agents.Service
	dataDir        string
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
	if err := a.initServices(); err != nil {
		panic(fmt.Errorf("initialise services: %w", err))
	}
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// ListProjects returns the stored project catalog.
func (a *App) ListProjects() ([]projects.ProjectDTO, error) {
	return a.projectService.List(context.Background())
}

// RegisterProject adds or updates a project record.
func (a *App) RegisterProject(req projects.RegisterProjectRequest) (projects.ProjectDTO, error) {
	return a.projectService.Register(context.Background(), req)
}

// DeleteProject removes a project from the catalog.
func (a *App) DeleteProject(id int64) error {
	return a.projectService.Remove(context.Background(), id)
}

// MarkProjectOpened updates the last opened timestamp for a project.
func (a *App) MarkProjectOpened(id int64) error {
	return a.projectService.MarkOpened(context.Background(), id)
}

// ListThreads returns threads for a project.
func (a *App) ListThreads(projectID int64) ([]agents.ThreadDTO, error) {
	if a.agentService == nil {
		return nil, fmt.Errorf("agent service not initialised")
	}
	return a.agentService.ListThreads(context.Background(), projectID)
}

// GetThread fetches a single thread by identifier.
func (a *App) GetThread(threadID int64) (agents.ThreadDTO, error) {
	if a.agentService == nil {
		return agents.ThreadDTO{}, fmt.Errorf("agent service not initialised")
	}
	return a.agentService.GetThread(context.Background(), threadID)
}

// LoadThreadConversation returns the persisted conversation for a thread.
func (a *App) LoadThreadConversation(threadID int64) ([]agents.ConversationEntryDTO, error) {
	if a.agentService == nil {
		return nil, fmt.Errorf("agent service not initialised")
	}
	return a.agentService.LoadThreadConversation(context.Background(), threadID)
}

// RenameThread updates the title of an existing thread.
func (a *App) RenameThread(threadID int64, title string) (agents.ThreadDTO, error) {
	if a.agentService == nil {
		return agents.ThreadDTO{}, fmt.Errorf("agent service not initialised")
	}
	return a.agentService.RenameThread(context.Background(), threadID, title)
}

// DeleteThread removes a thread and its associated conversation.
func (a *App) DeleteThread(threadID int64) error {
	if a.agentService == nil {
		return fmt.Errorf("agent service not initialised")
	}
	return a.agentService.DeleteThread(context.Background(), threadID)
}

// SelectProjectDirectory opens a native directory picker and returns the selected path.
func (a *App) SelectProjectDirectory(defaultDirectory string) (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application context not initialised")
	}

	options := wailsruntime.OpenDialogOptions{
		Title: "Select a project directory",
	}
	if defaultDirectory != "" {
		options.DefaultDirectory = defaultDirectory
	}

	selection, err := wailsruntime.OpenDirectoryDialog(a.ctx, options)
	if err != nil {
		return "", err
	}
	return selection, nil
}

// SaveClipboardImage persists a clipboard image to disk and returns the absolute path.
func (a *App) SaveClipboardImage(dataBase64 string, mimeType string) (string, error) {
	encoded := strings.TrimSpace(dataBase64)
	if encoded == "" {
		return "", fmt.Errorf("image data is required")
	}

	mediaType := strings.TrimSpace(mimeType)
	if mediaType == "" {
		mediaType = "image/png"
	}
	if !strings.HasPrefix(mediaType, "image/") {
		return "", fmt.Errorf("unsupported mime type %q", mediaType)
	}

	bytes, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("decode image data: %w", err)
	}
	if len(bytes) == 0 {
		return "", fmt.Errorf("image data is empty")
	}

	ext := ".png"
	if candidates, err := mime.ExtensionsByType(mediaType); err == nil {
		for _, candidate := range candidates {
			if candidate != "" {
				ext = candidate
				break
			}
		}
	} else if strings.Contains(mediaType, "jpeg") {
		ext = ".jpg"
	}

	attachmentsDir, err := a.attachmentsDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(attachmentsDir, 0o755); err != nil {
		return "", fmt.Errorf("create attachments directory: %w", err)
	}

	filename := uuid.NewString() + ext
	targetPath := filepath.Join(attachmentsDir, filename)
	if err := os.WriteFile(targetPath, bytes, 0o600); err != nil {
		return "", fmt.Errorf("write image: %w", err)
	}

	absolutePath, err := filepath.Abs(targetPath)
	if err != nil {
		return "", fmt.Errorf("resolve image path: %w", err)
	}
	return absolutePath, nil
}

// DeleteAttachment removes a previously saved attachment file.
func (a *App) DeleteAttachment(path string) error {
	trimmed := strings.TrimSpace(path)
	if trimmed == "" {
		return nil
	}

	targetPath, err := filepath.Abs(trimmed)
	if err != nil {
		return fmt.Errorf("resolve attachment path: %w", err)
	}

	attachmentsDir, err := a.attachmentsDir()
	if err != nil {
		return err
	}

	allowedRoots := []string{attachmentsDir}
	if legacyRoot, legacyErr := filepath.Abs(filepath.Join(legacyDataDirName, attachmentsDirName)); legacyErr == nil {
		allowedRoots = append(allowedRoots, legacyRoot)
	}

	var withinManaged bool
	for _, root := range allowedRoots {
		rootAbs, absErr := filepath.Abs(root)
		if absErr != nil {
			continue
		}
		rel, relErr := filepath.Rel(rootAbs, targetPath)
		if relErr != nil {
			continue
		}
		if rel == "." || rel == "" {
			return fmt.Errorf("invalid attachment path")
		}
		if rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
			continue
		}
		withinManaged = true
		break
	}

	if !withinManaged {
		return fmt.Errorf("attachment path outside managed directories")
	}

	if err := os.Remove(targetPath); err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("delete attachment: %w", err)
	}
	return nil
}

func (a *App) shutdown(ctx context.Context) {
    if a.db != nil {
        _ = a.db.Close()
    }
    if a.agentService != nil {
        a.agentService.StopWorktreeCleanup()
    }
}

func (a *App) ensureDataDir() (string, error) {
	if a.ctx == nil {
		return "", fmt.Errorf("application context not initialised")
	}

	if a.dataDir != "" {
		return a.dataDir, nil
	}

	env := wailsruntime.Environment(a.ctx)
	platform := strings.TrimSpace(env.Platform)
	if platform == "" {
		platform = goruntime.GOOS
	}

	dataDir, err := resolveAppDataDir(platform)
	if err != nil {
		return "", err
	}

	if err := os.MkdirAll(dataDir, 0o755); err != nil {
		return "", fmt.Errorf("ensure data directory: %w", err)
	}

	a.dataDir = dataDir
	return dataDir, nil
}

func resolveAppDataDir(platform string) (string, error) {
	switch strings.ToLower(strings.TrimSpace(platform)) {
	case "darwin":
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve home directory: %w", err)
		}
		return filepath.Join(home, "Library", "Application Support", appDataDirName), nil
	case "windows":
		if base := os.Getenv("APPDATA"); base != "" {
			return filepath.Join(base, appDataDirName), nil
		}
		base, err := os.UserConfigDir()
		if err != nil {
			return "", fmt.Errorf("resolve config directory: %w", err)
		}
		return filepath.Join(base, appDataDirName), nil
	default:
		if base := os.Getenv("XDG_DATA_HOME"); base != "" {
			return filepath.Join(base, appDataDirName), nil
		}
		home, err := os.UserHomeDir()
		if err != nil {
			return "", fmt.Errorf("resolve home directory: %w", err)
		}
		return filepath.Join(home, ".local", "share", appDataDirName), nil
	}
}

func (a *App) migrateLegacyDatabase(targetDir string) error {
	legacyPath := filepath.Join(legacyDataDirName, legacyDatabaseName)
	info, err := os.Stat(legacyPath)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) {
			return nil
		}
		return fmt.Errorf("stat legacy database: %w", err)
	}
	if info.IsDir() {
		return fmt.Errorf("legacy database path %q is a directory", legacyPath)
	}

	targetPath := filepath.Join(targetDir, legacyDatabaseName)
	if _, err := os.Stat(targetPath); err == nil {
		return nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("stat target database: %w", err)
	}

	if err := os.Rename(legacyPath, targetPath); err != nil {
		if err := copyFile(legacyPath, targetPath); err != nil {
			return fmt.Errorf("migrate legacy database: %w", err)
		}
		if removeErr := os.Remove(legacyPath); removeErr != nil && !errors.Is(removeErr, fs.ErrNotExist) {
			return fmt.Errorf("cleanup legacy database: %w", removeErr)
		}
	}

	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer func() {
		_ = out.Close()
	}()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}

	return out.Sync()
}

func (a *App) attachmentsDir() (string, error) {
	root, err := a.ensureDataDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(root, attachmentsDirName), nil
}

func (a *App) initServices() error {
	dataDir, err := a.ensureDataDir()
	fmt.Printf("Dir: %s\n", dataDir)
	if err != nil {
		return err
	}

	dbPath := filepath.Join(dataDir, legacyDatabaseName)

	db, err := sqlite.Open(dbPath)
	if err != nil {
		return err
	}

	if err := migrate.Up(db); err != nil {
		return err
	}

	a.db = db
	repo := discovery.NewRepository(db)
	a.repo = repo
	a.projectService = projects.NewService(repo)

	if err := a.initAgentService(repo); err != nil {
		return err
	}

	return nil
}

func (a *App) initAgentService(repo *discovery.Repository) error {
    adapter, err := agents.NewCodexAdapter(agents.CodexOptionsFromEnv())
    if err != nil {
        return fmt.Errorf("initialise codex adapter: %w", err)
    }

    dataDir, derr := a.ensureDataDir()
    if derr != nil {
        return derr
    }
    worktreesRoot := filepath.Join(dataDir, "worktrees")
    if err := os.MkdirAll(worktreesRoot, 0o755); err != nil {
        return fmt.Errorf("ensure worktrees root: %w", err)
    }

    manager := worktrees.NewManager(worktreesRoot, "")
    service := agents.NewService("codex", repo, agents.WithWorktreeManager(manager))
    if err := service.Register("codex", adapter); err != nil {
        return fmt.Errorf("register codex adapter: %w", err)
    }

    a.agentService = service
    a.agentService.StartWorktreeCleanup(time.Hour)
    return nil
}

// SendAgentMessage streams a prompt through the configured agent and emits runtime events.
func (a *App) SendAgentMessage(req agents.MessageRequest) (agents.StreamHandle, error) {
	if a.agentService == nil {
		return agents.StreamHandle{}, fmt.Errorf("agent service not initialised")
	}
	if a.ctx == nil {
		return agents.StreamHandle{}, fmt.Errorf("application context not initialised")
	}

	stream, thread, err := a.agentService.Send(context.Background(), req)
	if err != nil {
		return agents.StreamHandle{}, err
	}

	topic := agents.StreamTopic(stream.ID())

	go func() {
		defer stream.Close()

		for event := range stream.Events() {
			wailsruntime.EventsEmit(a.ctx, topic, event)
		}

		finalEvent := agents.StreamEvent{Type: "stream.complete"}
		if err := stream.Wait(); err != nil {
			finalEvent.Type = "stream.error"
			finalEvent.Error = &agents.StreamError{Message: err.Error()}
		} else {
			if updated, err := a.agentService.GetThread(context.Background(), thread.ID); err == nil {
				finalEvent.Message = updated.Status
			}
		}
		wailsruntime.EventsEmit(a.ctx, topic, finalEvent)
	}()

	return agents.StreamHandle{StreamID: stream.ID(), ThreadID: thread.ID, ThreadExternalID: thread.ExternalID}, nil
}

// CancelAgentStream stops an active agent stream.
func (a *App) CancelAgentStream(streamID string) (agents.CancelResponse, error) {
	if a.agentService == nil {
		return agents.CancelResponse{}, fmt.Errorf("agent service not initialised")
	}
	return a.agentService.Cancel(context.Background(), streamID)
}
