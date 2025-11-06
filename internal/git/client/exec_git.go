package client

import (
    "bufio"
    "context"
    "fmt"
    "os"
    "path/filepath"
    "strconv"
    "strings"

    "codex-ui/internal/git/runner"
)

// ExecClient implements Client using the git binary.
type ExecClient struct{ r runner.Runner }

func NewExecClient(bin string) *ExecClient { return &ExecClient{r: runner.NewExecRunner(bin)} }

func (c *ExecClient) DiffStats(ctx context.Context, root string) ([]FileDiffStat, error) {
    if strings.TrimSpace(root) == "" {
        return nil, fmt.Errorf("worktree path is required")
    }
    info, err := os.Stat(root)
    if err != nil {
        return nil, fmt.Errorf("stat worktree: %w", err)
    }
    if !info.IsDir() {
        return nil, fmt.Errorf("worktree path %q is not a directory", root)
    }

    statusMap, err := c.parseGitStatus(ctx, root)
    if err != nil { return nil, err }

    numstat := make(map[string][2]int)
    if err := c.accumulateNumstat(ctx, root, []string{"diff", "--numstat", "HEAD"}, numstat); err != nil {
        // Use the well-known empty tree hash to avoid writes
        const emptyTreeHash = "4b825dc642cb6eb9a060e54bf8d69288fbee4904"
        if err := c.accumulateNumstat(ctx, root, []string{"diff", "--numstat", emptyTreeHash}, numstat); err != nil { return nil, err }
    }
    if err := c.accumulateNumstat(ctx, root, []string{"diff", "--numstat", "--cached"}, numstat); err != nil { return nil, err }

    // merge
    result := make([]FileDiffStat, 0, len(statusMap))
    seen := make(map[string]bool)
    appendEntry := func(path string) {
        if seen[path] { return }
        entry := FileDiffStat{Path: path, Status: statusMap[path]}
        if counts, ok := numstat[path]; ok { entry.Added = counts[0]; entry.Removed = counts[1] }
        result = append(result, entry)
        seen[path] = true
    }
    for p := range statusMap { appendEntry(p) }
    for p := range numstat { appendEntry(p) }
    // keep order stable lexicographically
    // simple selection sort to avoid importing sort (small map sizes expected)
    for i := 0; i < len(result); i++ {
        min := i
        for j := i + 1; j < len(result); j++ {
            if result[j].Path < result[min].Path { min = j }
        }
        result[i], result[min] = result[min], result[i]
    }
    return result, nil
}

func (c *ExecClient) parseGitStatus(ctx context.Context, root string) (map[string]string, error) {
    output, err := c.r.Run(ctx, root, "status", "--porcelain")
    if err != nil { return nil, err }
    status := make(map[string]string)
    scanner := bufio.NewScanner(strings.NewReader(output))
    for scanner.Scan() {
        line := scanner.Text()
        if len(line) < 3 { continue }
        code := strings.TrimSpace(line[:2])
        rawPath := strings.TrimSpace(line[3:])
        if code == "" || rawPath == "" { continue }
        if strings.Contains(rawPath, " -> ") {
            parts := strings.Split(rawPath, " -> ")
            rawPath = parts[len(parts)-1]
        }
        path := strings.TrimSpace(rawPath)
        if strings.HasPrefix(path, "\"") {
            if decoded, err := strconv.Unquote(path); err == nil { path = decoded }
        }
        status[path] = code
    }
    if err := scanner.Err(); err != nil { return nil, fmt.Errorf("scan git status: %w", err) }
    return status, nil
}

func (c *ExecClient) accumulateNumstat(ctx context.Context, root string, args []string, accum map[string][2]int) error {
    output, err := c.r.Run(ctx, root, args...)
    if err != nil { return err }
    scanner := bufio.NewScanner(strings.NewReader(output))
    for scanner.Scan() {
        parts := strings.Split(scanner.Text(), "\t")
        if len(parts) < 3 { continue }
        added := parseNum(parts[0])
        removed := parseNum(parts[1])
        path := strings.TrimSpace(parts[2])
        if path == "" { continue }
        if strings.Contains(path, " -> ") {
            seg := strings.Split(path, " -> ")
            path = seg[len(seg)-1]
        }
        cur := accum[path]
        cur[0] += added
        cur[1] += removed
        accum[path] = cur
    }
    return scanner.Err()
}

func parseNum(v string) int {
    v = strings.TrimSpace(v)
    if v == "-" { return 0 }
    n, err := strconv.Atoi(v)
    if err != nil { return 0 }
    return n
}

func (c *ExecClient) RepoRoot(ctx context.Context, path string) (string, error) {
    out, err := c.r.Run(ctx, path, "rev-parse", "--show-toplevel")
    if err != nil { return "", err }
    return strings.TrimSpace(out), nil
}

func (c *ExecClient) CurrentRef(ctx context.Context, path string) (string, error) {
    if out, err := c.r.Run(ctx, path, "symbolic-ref", "--short", "-q", "HEAD"); err == nil {
        if b := strings.TrimSpace(out); b != "" { return b, nil }
    }
    out, err := c.r.Run(ctx, path, "rev-parse", "HEAD")
    if err != nil { return "", fmt.Errorf("resolve base ref: %w", err) }
    return strings.TrimSpace(out), nil
}

func (c *ExecClient) IsRepoPath(ctx context.Context, path string) (bool, error) {
    _, err := c.r.Run(ctx, path, "rev-parse", "--is-inside-work-tree")
    if err != nil { return false, nil }
    // Ensure we are within an actual repo root hierarchy
    root, rErr := c.RepoRoot(ctx, path)
    if rErr != nil || root == "" { return false, nil }
    abs, aErr := filepath.Abs(path)
    if aErr != nil { return false, nil }
    rel, relErr := filepath.Rel(root, abs)
    if relErr != nil { return false, nil }
    if rel == "." || rel == "" { return true, nil }
    return !strings.HasPrefix(rel, ".."), nil
}
