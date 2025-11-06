package runner

import (
    "bytes"
    "context"
    "fmt"
    "os/exec"
    "strings"
)

// Runner abstracts executing git operations.
// Implementations may call the git binary or use a library and simulate output.
type Runner interface {
    Run(ctx context.Context, root string, args ...string) (string, error)
}

// ExecRunner executes the configured git binary.
type ExecRunner struct {
    GitBin string
}

func NewExecRunner(gitBin string) *ExecRunner {
    if strings.TrimSpace(gitBin) == "" {
        gitBin = "git"
    }
    return &ExecRunner{GitBin: gitBin}
}

func (e *ExecRunner) Run(ctx context.Context, root string, args ...string) (string, error) {
    cmd := exec.CommandContext(ctx, e.GitBin, args...)
    if strings.TrimSpace(root) != "" {
        cmd.Dir = root
    }
    var out bytes.Buffer
    var errb bytes.Buffer
    cmd.Stdout = &out
    cmd.Stderr = &errb
    if err := cmd.Run(); err != nil {
        msg := strings.TrimSpace(errb.String())
        if msg == "" { msg = strings.TrimSpace(out.String()) }
        if msg == "" { msg = err.Error() }
        return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), msg)
    }
    return out.String(), nil
}

