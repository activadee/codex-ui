package client

import (
    "context"
    "fmt"
    "os"
    "path/filepath"

    git "github.com/go-git/go-git/v5"
)

// GoGitClient implements Client using go-git for read ops.
type GoGitClient struct{ exec *ExecClient }

func NewGoGitClient() *GoGitClient { return &GoGitClient{exec: NewExecClient("")} }

func (g *GoGitClient) DiffStats(ctx context.Context, root string) ([]FileDiffStat, error) { return g.exec.DiffStats(ctx, root) }

func porcelainCode(s git.Status, path string) string {
    st, ok := s[path]
    if !ok { return "" }
    code := func(v git.StatusCode) string {
        switch v {
        case git.Modified:
            return "M"
        case git.Added:
            return "A"
        case git.Deleted:
            return "D"
        case git.Renamed:
            return "R"
        case git.Untracked:
            return "??"
        case git.Unmodified:
            return ""
        default:
            return "?"
        }
    }
    if c := code(st.Staging); c != "" { return c }
    return code(st.Worktree)
}

func (g *GoGitClient) RepoRoot(ctx context.Context, path string) (string, error) {
    // walk up until .git found
    start, err := filepath.Abs(path)
    if err != nil { return "", err }
    fi, err := os.Stat(start)
    if err == nil && !fi.IsDir() {
        start = filepath.Dir(start)
    }
    cur := start
    for {
        if _, err := os.Stat(filepath.Join(cur, ".git")); err == nil {
            return cur, nil
        }
        parent := filepath.Dir(cur)
        if parent == cur { break }
        cur = parent
    }
    return "", fmt.Errorf("not a git repository: %s", path)
}

func (g *GoGitClient) CurrentRef(ctx context.Context, path string) (string, error) {
    root, err := g.RepoRoot(ctx, path)
    if err != nil { return "", err }
    repo, err := git.PlainOpen(root)
    if err != nil { return "", fmt.Errorf("open repo: %w", err) }
    head, err := repo.Head()
    if err != nil { return "", err }
    if head.Name().IsBranch() { return head.Name().Short(), nil }
    return head.Hash().String(), nil
}

func (g *GoGitClient) IsRepoPath(ctx context.Context, path string) (bool, error) {
    _, err := g.RepoRoot(ctx, path)
    if err != nil { return false, nil }
    return true, nil
}
