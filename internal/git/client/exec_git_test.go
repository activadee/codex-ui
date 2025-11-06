package client

import (
    "context"
    "os"
    "os/exec"
    "path/filepath"
    "testing"
)

func requireGit(t *testing.T) {
    t.Helper()
    if _, err := exec.LookPath("git"); err != nil {
        t.Skip("git not available in PATH")
    }
}

func TestExecClientDiffStats(t *testing.T) {
    requireGit(t)
    dir := t.TempDir()
    run := func(args ...string) {
        cmd := exec.Command("git", args...)
        cmd.Dir = dir
        out, err := cmd.CombinedOutput()
        if err != nil {
            t.Fatalf("git %v: %v\n%s", args, err, string(out))
        }
    }
    run("init")
    run("config", "user.email", "you@example.com")
    run("config", "user.name", "Your Name")
    // commit a file
    os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\n"), 0o644)
    run("add", "a.txt")
    run("commit", "-m", "init")
    // modify a.txt (unstaged)
    os.WriteFile(filepath.Join(dir, "a.txt"), []byte("one\ntwo\n"), 0o644)
    // add new file staged
    os.WriteFile(filepath.Join(dir, "b.txt"), []byte("new\n"), 0o644)
    run("add", "b.txt")

    c := NewExecClient("")
    stats, err := c.DiffStats(context.Background(), dir)
    if err != nil { t.Fatalf("DiffStats: %v", err) }
    if len(stats) == 0 { t.Fatalf("expected diff stats, got 0") }
    // ensure paths present
    var seenA, seenB bool
    for _, st := range stats {
        if st.Path == "a.txt" { seenA = true }
        if st.Path == "b.txt" { seenB = true }
    }
    if !seenA || !seenB { t.Fatalf("expected a.txt and b.txt in stats, got %+v", stats) }
}

