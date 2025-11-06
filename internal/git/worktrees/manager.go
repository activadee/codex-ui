package worktrees

import (
    "bytes"
    "context"
    "fmt"
    "os"
    "os/exec"
    "path/filepath"
    "regexp"
    "strconv"
    "strings"
)
import gitc "codex-ui/internal/git/client"

// Manager manages per-thread git worktrees under a managed root directory.
type Manager struct {
    root   string
    gitBin string
    git    gitc.Client
}

// NewManager constructs a Manager. gitBin defaults to "git" when empty.
func NewManager(root, gitBin string) *Manager {
    if strings.TrimSpace(gitBin) == "" {
        gitBin = "git"
    }
    return &Manager{root: root, gitBin: gitBin, git: gitc.NewExecClient(gitBin)}
}

// SetGitClient overrides the internal git client used for read ops.
func (m *Manager) SetGitClient(c gitc.Client) { if c != nil { m.git = c } }

// Root returns the managed root path.
func (m *Manager) Root() string { return m.root }

// EnsureForThread creates or reuses a worktree for the given project and thread.
// Returns the absolute worktree path, the working directory inside the worktree
// (accounting for subdirectory projects), and the repository root.
func (m *Manager) EnsureForThread(ctx context.Context, projectPath string, threadID int64, nameHint string, branchName string) (string, string, string, error) {
	if strings.TrimSpace(projectPath) == "" {
		return "", "", "", fmt.Errorf("project path is required")
	}

    repoRoot, err := m.git.RepoRoot(ctx, projectPath)
    if err != nil {
        return "", "", "", fmt.Errorf("project not a git repo: %w", err)
    }

	projectSlug := sanitizeSegment(filepath.Base(projectPath))
	trimmedHint := strings.TrimSpace(nameHint)
	idSuffix := strconv.FormatInt(threadID, 10)
	dirSuffix := idSuffix
	if trimmedHint != "" {
		dirSuffix = fmt.Sprintf("%s-%s", sanitizeSegment(trimmedHint), idSuffix)
	}
	worktreePath := filepath.Join(m.root, projectSlug, dirSuffix)
	// Back-compat: if using a new suffix but old id-only worktree exists, reuse it
	if dirSuffix != idSuffix {
		oldPath := filepath.Join(m.root, projectSlug, idSuffix)
        if st, err := os.Stat(oldPath); err == nil && st.IsDir() {
            if ok, _ := m.git.IsRepoPath(ctx, oldPath); ok {
                worktreePath = oldPath
            }
        }
    }
	if err := os.MkdirAll(filepath.Dir(worktreePath), 0o755); err != nil {
		return "", "", "", fmt.Errorf("ensure worktree parent: %w", err)
	}

	// If exists and looks valid, reuse; otherwise create/attach
    if st, err := os.Stat(worktreePath); err == nil && st.IsDir() {
        if ok, _ := m.git.IsRepoPath(ctx, worktreePath); ok {
            // reuse existing
        } else {
            // try force re-add on top of existing content
            if err := m.addWorktree(ctx, repoRoot, worktreePath, projectPath, threadID, branchName, true); err != nil {
                return "", "", "", err
			}
		}
	} else {
		if err := m.addWorktree(ctx, repoRoot, worktreePath, projectPath, threadID, branchName, false); err != nil {
			return "", "", "", err
		}
	}

	// Compute working dir mapping for subdir projects
	rel, relErr := filepath.Rel(repoRoot, projectPath)
	var workingDir string
	if relErr == nil && rel != "." && rel != "" {
		workingDir = filepath.Join(worktreePath, rel)
		if mkErr := os.MkdirAll(workingDir, 0o755); mkErr != nil {
			return "", "", "", fmt.Errorf("ensure working subdir: %w", mkErr)
		}
	} else {
		workingDir = worktreePath
	}

	return worktreePath, workingDir, repoRoot, nil
}

// RemoveForThread removes the given worktree path from its repository and prunes worktrees.
func (m *Manager) RemoveForThread(ctx context.Context, worktreePath string) error {
	if strings.TrimSpace(worktreePath) == "" {
		return nil
	}
	if !m.withinRoot(worktreePath) {
		return fmt.Errorf("worktree path outside managed root")
	}
    repoRoot, err := m.git.RepoRoot(ctx, worktreePath)
    if err != nil {
        return nil // best effort
    }
	// git worktree remove --force <path>
	if _, err := m.runGit(ctx, repoRoot, "worktree", "remove", "--force", worktreePath); err != nil {
		// ignore if already gone
		// continue to prune anyway
	}
	_, _ = m.runGit(ctx, repoRoot, "worktree", "prune")
	return nil
}

func (m *Manager) addWorktree(ctx context.Context, repoRoot, worktreePath, projectPath string, threadID int64, branchName string, force bool) error {
    baseRef, err := m.git.CurrentRef(ctx, projectPath)
    if err != nil {
        return err
    }
	branch := strings.TrimSpace(branchName)
	if branch == "" {
		branch = fmt.Sprintf("codex/thread/%d", threadID)
	}
	args := []string{"worktree", "add"}
	if force {
		args = append(args, "--force")
	}
	args = append(args, "-B", branch, worktreePath, baseRef)
	if _, err := m.runGit(ctx, repoRoot, args...); err != nil {
		return fmt.Errorf("add worktree: %w", err)
	}
	return nil
}

// currentBranchOrHead/isGitDir/gitShowTopLevel now delegated via m.git

func (m *Manager) runGit(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, m.gitBin, args...)
	if dir != "" {
		cmd.Dir = dir
	}
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = strings.TrimSpace(stdout.String())
		}
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), msg)
	}
	return stdout.String(), nil
}

func (m *Manager) withinRoot(path string) bool {
	rootAbs, err := filepath.Abs(m.root)
	if err != nil {
		return false
	}
	pAbs, err := filepath.Abs(path)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(rootAbs, pAbs)
	if err != nil {
		return false
	}
	if rel == "." || rel == "" {
		return false // path equal to root is not a worktree leaf
	}
	return !strings.HasPrefix(rel, "..")
}

var segmentSanitizer = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

func sanitizeSegment(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return "project"
	}
	s = segmentSanitizer.ReplaceAllString(s, "-")
	s = strings.Trim(s, "-._")
	if s == "" {
		return "project"
	}
	return strings.ToLower(s)
}
