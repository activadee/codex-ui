package agents

import (
    "context"
    "database/sql"
    "errors"
    "os"
    "path/filepath"
    "regexp"
    "strconv"
    "strings"
    "time"
)

// StartWorktreeCleanup launches a periodic cleanup goroutine that removes
// worktree directories whose threads no longer exist. Interval defaults to 1h
// if zero or negative.
func (s *Service) StartWorktreeCleanup(interval time.Duration) {
    if s.worktrees == nil { return }
    if interval <= 0 { interval = time.Hour }
    if s.cleanupStop != nil { return }
    stop := make(chan struct{})
    s.cleanupStop = stop
    ticker := time.NewTicker(interval)
    go func() {
        defer ticker.Stop()
        for {
            select {
            case <-ticker.C:
                _ = s.cleanupOrphanWorktrees(context.Background())
            case <-stop:
                return
            }
        }
    }()
}

// StopWorktreeCleanup stops the background cleanup worker if running.
func (s *Service) StopWorktreeCleanup() {
    if s.cleanupStop != nil {
        close(s.cleanupStop)
        s.cleanupStop = nil
    }
}

func (s *Service) isThreadActive(threadID int64) bool {
    s.activeMu.Lock()
    defer s.activeMu.Unlock()
    for _, a := range s.active {
        if a.threadID == threadID { return true }
    }
    return false
}

func (s *Service) cleanupOrphanWorktrees(ctx context.Context) error {
    root := strings.TrimSpace(s.worktrees.Root())
    if root == "" { return nil }
    projectDirs, err := os.ReadDir(root)
    if err != nil { return nil }
    for _, pd := range projectDirs {
        if !pd.IsDir() { continue }
        projectPath := filepath.Join(root, pd.Name())
        threadDirs, err := os.ReadDir(projectPath)
        if err != nil { continue }
        for _, td := range threadDirs {
            if !td.IsDir() { continue }
            id, ok := parseThreadIDFromDir(td.Name())
            if !ok || id <= 0 { continue }
            if s.isThreadActive(id) { continue }
            if _, err := s.repo.GetThread(ctx, id); err != nil {
                if errors.Is(err, sql.ErrNoRows) {
                    _ = s.worktrees.RemoveForThread(ctx, filepath.Join(projectPath, td.Name()))
                }
            }
        }
    }
    return nil
}

var trailingDigits = regexp.MustCompile(`(\d+)$`)

// parseThreadIDFromDir extracts the numeric thread ID from a directory name.
// Accepts both "123" and slugged names ending with "-<id>".
func parseThreadIDFromDir(name string) (int64, bool) {
    trimmed := strings.TrimSpace(name)
    if trimmed == "" { return 0, false }
    if id, err := strconv.ParseInt(trimmed, 10, 64); err == nil { return id, true }
    if m := trailingDigits.FindStringSubmatch(trimmed); len(m) == 2 {
        if id, err := strconv.ParseInt(m[1], 10, 64); err == nil { return id, true }
    }
    return 0, false
}
