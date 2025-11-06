package agents

import (
    "fmt"
    "os"
    "path/filepath"
    "time"

    gitc "codex-ui/internal/git/client"
    "codex-ui/internal/git/worktrees"
    "codex-ui/internal/storage/discovery"
)

// BootstrapService constructs the default agent service backed by the Codex adapter.
// It ensures the worktrees root exists under the provided data directory and
// starts the scheduled cleanup worker.
func BootstrapService(dataDir string, repo *discovery.Repository) (*Service, error) {
	adapter, err := NewCodexAdapter(CodexOptionsFromEnv())
	if err != nil {
		return nil, fmt.Errorf("initialise codex adapter: %w", err)
	}

	worktreesRoot := filepath.Join(dataDir, "worktrees")
	if err := os.MkdirAll(worktreesRoot, 0o755); err != nil {
		return nil, fmt.Errorf("ensure worktrees root: %w", err)
	}

    manager := worktrees.NewManager(worktreesRoot, "")
    // Use go-git for read ops (repo root / current ref), exec for write/worktree ops
    manager.SetGitClient(gitc.NewGoGitClient())
    gitClient := gitc.NewGoGitClient()
    service := NewService("codex", repo, WithWorktreeManager(manager), WithGitClient(gitClient))
	if err := service.Register("codex", adapter); err != nil {
		return nil, fmt.Errorf("register codex adapter: %w", err)
	}

	service.StartWorktreeCleanup(time.Hour)
	return service, nil
}
