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
    "os/exec"
    "path/filepath"
    goruntime "runtime"
    "strings"
    "sync"
    "syscall"
    "time"

	"codex-ui/internal/services/agents"
	"codex-ui/internal/services/projects"
	"codex-ui/internal/storage/discovery"
	"codex-ui/internal/storage/migrate"
	"codex-ui/internal/storage/sqlite"
	"codex-ui/internal/worktrees"

	"github.com/creack/pty"
	"github.com/fsnotify/fsnotify"
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

	watchersMu   sync.Mutex
	watchers     map[int64]*fsnotify.Watcher
	notifyTimers map[int64]*time.Timer

	terminalMu sync.Mutex
	terminals  map[int64]*terminalSession
	shellPath  string
}

type terminalSession struct {
	threadID int64
	cmd      *exec.Cmd
	pty      *os.File
	cancel   context.CancelFunc
	done     chan struct{}
}

type TerminalHandle struct {
	ThreadID int64 `json:"threadId"`
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{
		watchers:     make(map[int64]*fsnotify.Watcher),
		notifyTimers: make(map[int64]*time.Timer),
		terminals:    make(map[int64]*terminalSession),
		shellPath:    detectShell(),
	}
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

// ListThreadFileDiffs returns git diff stats for the given thread.
func (a *App) ListThreadFileDiffs(threadID int64) ([]agents.FileDiffStatDTO, error) {
	if a.agentService == nil {
		return nil, fmt.Errorf("agent service not initialised")
	}
	thread, err := a.agentService.GetThread(context.Background(), threadID)
	if err != nil {
		return nil, err
	}
	a.ensureThreadWatcher(thread.ID, thread.WorktreePath)
	return a.agentService.ListThreadDiffStats(context.Background(), threadID)
}

// CreatePullRequest commits pending changes, pushes a branch, and creates a GitHub PR.
// Returns the PR URL. If a PR already exists and is stored, returns it without changes.
func (a *App) CreatePullRequest(threadID int64) (string, error) {
    if a.agentService == nil {
        return "", fmt.Errorf("agent service not initialised")
    }
    // Load thread & short-circuit if PR already recorded
    thread, err := a.agentService.GetThread(context.Background(), threadID)
    if err != nil {
        return "", err
    }
    if strings.TrimSpace(thread.PRURL) != "" {
        return thread.PRURL, nil
    }
    // Ensure there are changes to create a PR for
    diffs, err := a.agentService.ListThreadDiffStats(context.Background(), threadID)
    if err != nil {
        return "", err
    }
    if len(diffs) == 0 {
        return "", fmt.Errorf("no file changes detected")
    }

    // Build agent request
    instruction := buildCreatePRInstruction(thread.ID)
    req := agents.MessageRequest{
        ThreadID: thread.ID,
        ThreadOptions: agents.ThreadOptionsDTO{
            Model:          "gpt-5",
            SandboxMode:    "danger-full-access",
            ReasoningLevel: "minimal",
        },
        Input: instruction,
    }

    // Stream without emitting UI events; collect PR URL
    stream, _, err := a.agentService.Send(context.Background(), req)
    if err != nil {
        return "", err
    }
    defer stream.Close()

    var prURL string
    for evt := range stream.Events() {
        if url := agents.ExtractPRURLFromEvent(evt); url != "" {
            prURL = url
        }
    }
    if waitErr := stream.Wait(); waitErr != nil {
        return "", waitErr
    }
    if strings.TrimSpace(prURL) == "" {
        return "", fmt.Errorf("failed to detect PR URL from agent run")
    }

    // Persist PR URL and notify UI about diffs (likely reduced)
    if err := a.repo.UpdateThreadPRURL(context.Background(), thread.ID, prURL); err != nil {
        return "", err
    }
    a.emitThreadDiffUpdate(thread.ID)
    return prURL, nil
}

func buildCreatePRInstruction(threadID int64) string {
    // Deterministic, GitHub-only instruction. Final output must include PR_URL marker.
    return fmt.Sprintf(`You are operating in a git worktree branch for this thread.
Task:
1) Review all staged and unstaged changes.
2) Group logically and create conventional commits (feat|fix|chore|refactor|docs|test) with meaningful scope and messages.
3) Push the branch 'codex/thread/%d' to origin and ensure upstream is set.
4) Create or update a GitHub pull request from this branch against the default base branch.
   - Use a conventional title.
   - Write a clear, structured description that summarizes the changes.

Constraints:
- Prefer the GitHub CLI (gh). If a PR already exists for the branch, update it.
- Do not print secrets or token values.

Output:
- After completion print exactly one line with: PR_URL: https://github.com/<owner>/<repo>/pull/<number>
- Do not include any other lines after the PR_URL line.`, threadID)
}


// StartThreadTerminal starts or reuses a per-thread terminal session.
func (a *App) StartThreadTerminal(threadID int64) (TerminalHandle, error) {
	if a.agentService == nil {
		return TerminalHandle{}, fmt.Errorf("agent service not initialised")
	}
	thread, err := a.agentService.GetThread(context.Background(), threadID)
	if err != nil {
		return TerminalHandle{}, err
	}
	worktree := strings.TrimSpace(thread.WorktreePath)
	if worktree == "" {
		return TerminalHandle{}, fmt.Errorf("thread %d has no worktree", threadID)
	}

	a.ensureThreadWatcher(threadID, worktree)

	a.terminalMu.Lock()
	if existing, ok := a.terminals[threadID]; ok {
		a.terminalMu.Unlock()
		if existing.cmd.ProcessState != nil && existing.cmd.ProcessState.Exited() {
			a.StopThreadTerminal(threadID) // cleanup exited process
		} else {
			return TerminalHandle{ThreadID: threadID}, nil
		}
	} else {
		a.terminalMu.Unlock()
	}

	ctx, cancel := context.WithCancel(context.Background())
	shell := a.shellPath
	if strings.TrimSpace(shell) == "" {
		shell = defaultShell()
	}
	args := shellArgs(shell)
	cmd := exec.CommandContext(ctx, shell, args...)
	cmd.Dir = worktree
	cmd.Env = os.Environ()
	if envHasKey(cmd.Env, "TERM") == false {
		cmd.Env = append(cmd.Env, "TERM=xterm-256color")
	}
	cmd.Env = append(cmd.Env, fmt.Sprintf("THREAD_ID=%d", threadID))

	ptmx, err := pty.Start(cmd)
	if err != nil {
		cancel()
		return TerminalHandle{}, fmt.Errorf("start terminal: %w", err)
	}

	session := &terminalSession{
		threadID: threadID,
		cmd:      cmd,
		pty:      ptmx,
		cancel:   cancel,
		done:     make(chan struct{}),
	}

	a.terminalMu.Lock()
	a.terminals[threadID] = session
	a.terminalMu.Unlock()

	go a.forwardTerminalOutput(session)

	a.emitTerminalReady(threadID)
	return TerminalHandle{ThreadID: threadID}, nil
}

// WriteThreadTerminal writes input to the terminal session.
func (a *App) WriteThreadTerminal(threadID int64, data string) error {
	session, ok := a.getTerminal(threadID)
	if !ok {
		return fmt.Errorf("terminal for thread %d not started", threadID)
	}
	if _, err := session.pty.Write([]byte(data)); err != nil {
		return fmt.Errorf("write terminal: %w", err)
	}
	return nil
}

// ResizeThreadTerminal adjusts terminal window size.
func (a *App) ResizeThreadTerminal(threadID int64, cols, rows int) error {
	session, ok := a.getTerminal(threadID)
	if !ok {
		return fmt.Errorf("terminal for thread %d not started", threadID)
	}
	if err := pty.Setsize(session.pty, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}); err != nil {
		return fmt.Errorf("resize terminal: %w", err)
	}
	return nil
}

// StopThreadTerminal terminates a running terminal session for a thread.
func (a *App) StopThreadTerminal(threadID int64) error {
	session, ok := a.getTerminal(threadID)
	if !ok {
		return nil
	}
	session.cancel()
	_ = session.pty.Close()
	<-session.done
	return nil
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
	if err := a.agentService.DeleteThread(context.Background(), threadID); err != nil {
		return err
	}
	_ = a.StopThreadTerminal(threadID)
	a.removeThreadWatcher(threadID)
	return nil
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
	_ = ctx
	if a.db != nil {
		_ = a.db.Close()
	}
	if a.agentService != nil {
		a.agentService.StopWorktreeCleanup()
	}

	a.watchersMu.Lock()
	timers := make([]*time.Timer, 0, len(a.notifyTimers))
	for _, timer := range a.notifyTimers {
		timers = append(timers, timer)
	}
	watchers := make([]*fsnotify.Watcher, 0, len(a.watchers))
	for _, watcher := range a.watchers {
		watchers = append(watchers, watcher)
	}
	a.notifyTimers = make(map[int64]*time.Timer)
	a.watchers = make(map[int64]*fsnotify.Watcher)
	a.watchersMu.Unlock()

	a.terminalMu.Lock()
	sessions := make([]*terminalSession, 0, len(a.terminals))
	for _, session := range a.terminals {
		sessions = append(sessions, session)
	}
	a.terminals = make(map[int64]*terminalSession)
	a.terminalMu.Unlock()

	for _, timer := range timers {
		if timer != nil {
			timer.Stop()
		}
	}
	for _, watcher := range watchers {
		if watcher != nil {
			_ = watcher.Close()
		}
	}
	for _, session := range sessions {
		if session == nil {
			continue
		}
		session.cancel()
		_ = session.pty.Close()
		<-session.done
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

	a.ensureThreadWatcher(thread.ID, thread.WorktreePath)
	go a.emitThreadDiffUpdate(thread.ID)

	topic := agents.StreamTopic(stream.ID())

	go func() {
		defer stream.Close()

		for event := range stream.Events() {
			if event.Item != nil && len(event.Item.FileDiffs) > 0 {
				go a.emitThreadDiffUpdate(thread.ID)
			}
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

func (a *App) ensureThreadWatcher(threadID int64, worktree string) {
	worktree = strings.TrimSpace(worktree)
	if worktree == "" {
		return
	}

	a.watchersMu.Lock()
	if watcher, exists := a.watchers[threadID]; exists {
		a.watchersMu.Unlock()
		_ = watcher.Add(worktree) // ensure root tracked even if created later
		return
	}
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		a.watchersMu.Unlock()
		fmt.Printf("create watcher for thread %d: %v\n", threadID, err)
		return
	}
	a.watchers[threadID] = watcher
	a.watchersMu.Unlock()

	if err := addWatcherRecursive(watcher, worktree); err != nil {
		fmt.Printf("watcher setup for thread %d: %v\n", threadID, err)
	}

	go a.observeWorktree(threadID, watcher)
}

func addWatcherRecursive(watcher *fsnotify.Watcher, root string) error {
	return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil
		}
		if !d.IsDir() {
			return nil
		}
		if d.Name() == ".git" {
			return filepath.SkipDir
		}
		if err := watcher.Add(path); err != nil {
			fmt.Printf("watcher add %s: %v\n", path, err)
		}
		return nil
	})
}

func (a *App) observeWorktree(threadID int64, watcher *fsnotify.Watcher) {
	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if a.isIgnoredPath(event.Name) {
				continue
			}
			if event.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(event.Name); err == nil && info.IsDir() {
					_ = addWatcherRecursive(watcher, event.Name)
				}
			}
			a.scheduleDiffNotification(threadID)
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			fmt.Printf("watcher error thread %d: %v\n", threadID, err)
		}
	}
}

func (a *App) isIgnoredPath(path string) bool {
	if path == "" {
		return false
	}
	if strings.Contains(path, string(filepath.Separator)+".git"+string(filepath.Separator)) {
		return true
	}
	return strings.HasSuffix(path, string(filepath.Separator)+".git")
}

func (a *App) scheduleDiffNotification(threadID int64) {
	a.watchersMu.Lock()
	if timer, ok := a.notifyTimers[threadID]; ok {
		timer.Stop()
	}
	var timer *time.Timer
	timer = time.AfterFunc(200*time.Millisecond, func() {
		a.emitThreadDiffUpdate(threadID)
		a.watchersMu.Lock()
		if current, exists := a.notifyTimers[threadID]; exists && current == timer {
			delete(a.notifyTimers, threadID)
		}
		a.watchersMu.Unlock()
	})
	a.notifyTimers[threadID] = timer
	a.watchersMu.Unlock()
}

func (a *App) emitThreadDiffUpdate(threadID int64) {
	if a.agentService == nil || a.ctx == nil {
		return
	}
	stats, err := a.agentService.ListThreadDiffStats(context.Background(), threadID)
	if err != nil {
		fmt.Printf("list thread diff stats %d: %v\n", threadID, err)
		return
	}
	payload := struct {
		ThreadID int64                    `json:"threadId"`
		Files    []agents.FileDiffStatDTO `json:"files"`
	}{
		ThreadID: threadID,
		Files:    stats,
	}
	topic := agents.FileChangeTopic(threadID)
	wailsruntime.EventsEmit(a.ctx, topic, payload)
}

func (a *App) removeThreadWatcher(threadID int64) {
	a.watchersMu.Lock()
	if timer, ok := a.notifyTimers[threadID]; ok {
		timer.Stop()
		delete(a.notifyTimers, threadID)
	}
	watcher, ok := a.watchers[threadID]
	if ok {
		delete(a.watchers, threadID)
	}
	a.watchersMu.Unlock()
	if ok {
		_ = watcher.Close()
	}
}

func (a *App) getTerminal(threadID int64) (*terminalSession, bool) {
	a.terminalMu.Lock()
	session, ok := a.terminals[threadID]
	a.terminalMu.Unlock()
	if !ok || session == nil {
		return nil, false
	}
	return session, true
}

func (a *App) forwardTerminalOutput(session *terminalSession) {
	buffer := make([]byte, 4096)
	defer func() {
		_ = session.pty.Close()
		_ = session.cmd.Wait()
		close(session.done)
		a.terminalMu.Lock()
		if current, ok := a.terminals[session.threadID]; ok && current == session {
			delete(a.terminals, session.threadID)
		}
		a.terminalMu.Unlock()
		status := "exited"
		if session.cmd.ProcessState != nil && !session.cmd.ProcessState.Success() {
			status = fmt.Sprintf("exit:%d", session.cmd.ProcessState.ExitCode())
		}
		a.emitTerminalExit(session.threadID, status)
	}()

	for {
		n, err := session.pty.Read(buffer)
		if n > 0 {
			chunk := make([]byte, n)
			copy(chunk, buffer[:n])
			a.emitTerminalOutput(session.threadID, chunk)
		}
		if err != nil {
			if !errors.Is(err, os.ErrClosed) && !errors.Is(err, io.EOF) {
				var errno syscall.Errno
				// Ignore EIO (errno 5) on Unix-like systems when PTY is closed.
				if !(goruntime.GOOS != "windows" && errors.As(err, &errno) && errno == syscall.Errno(5)) {
					fmt.Printf("terminal read thread %d: %v\n", session.threadID, err)
				}
			}
			return
		}
	}
}

type terminalEvent struct {
	ThreadID int64  `json:"threadId"`
	Type     string `json:"type"`
	Data     string `json:"data,omitempty"`
	Status   string `json:"status,omitempty"`
}

func (a *App) emitTerminalReady(threadID int64) {
	a.emitTerminalEvent(terminalEvent{ThreadID: threadID, Type: "ready"})
}

func (a *App) emitTerminalOutput(threadID int64, data []byte) {
	if len(data) == 0 {
		return
	}
	encoded := base64.StdEncoding.EncodeToString(data)
	a.emitTerminalEvent(terminalEvent{ThreadID: threadID, Type: "output", Data: encoded})
}

func (a *App) emitTerminalExit(threadID int64, status string) {
	if status == "" {
		status = "exited"
	}
	a.emitTerminalEvent(terminalEvent{ThreadID: threadID, Type: "exit", Status: status})
}

func (a *App) emitTerminalEvent(event terminalEvent) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, agents.TerminalTopic(event.ThreadID), event)
}

func shellArgs(shell string) []string {
	base := filepath.Base(shell)
	switch base {
	case "bash", "zsh", "fish":
		return []string{"-l"}
	case "pwsh", "powershell.exe":
		return []string{"-NoLogo"}
	default:
		return nil
	}
}

func envHasKey(env []string, key string) bool {
	for _, pair := range env {
		if strings.HasPrefix(pair, key+"=") {
			return true
		}
	}
	return false
}

func detectShell() string {
	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}
	if goruntime.GOOS == "windows" {
		if comspec := os.Getenv("COMSPEC"); comspec != "" {
			return comspec
		}
		return "powershell.exe"
	}
	return defaultShell()
}

func defaultShell() string {
	if goruntime.GOOS == "windows" {
		return "powershell.exe"
	}
	if shell := os.Getenv("SHELL"); shell != "" {
		return shell
	}
	return "/bin/sh"
}

// CancelAgentStream stops an active agent stream.
func (a *App) CancelAgentStream(streamID string) (agents.CancelResponse, error) {
	if a.agentService == nil {
		return agents.CancelResponse{}, fmt.Errorf("agent service not initialised")
	}
	return a.agentService.Cancel(context.Background(), streamID)
}
