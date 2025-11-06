package client

import "context"

// Client provides read-only git queries used by the app.
// Implementations may use the git binary or a pure-Go library.
type Client interface {
    // DiffStats aggregates staged + unstaged changes under root.
    DiffStats(ctx context.Context, root string) ([]FileDiffStat, error)
    // RepoRoot returns the repository toplevel for a path inside a repo.
    RepoRoot(ctx context.Context, path string) (string, error)
    // CurrentRef returns the current branch name or commit hash for HEAD.
    CurrentRef(ctx context.Context, path string) (string, error)
    // IsRepoPath reports whether path is inside a git work tree.
    IsRepoPath(ctx context.Context, path string) (bool, error)
}

