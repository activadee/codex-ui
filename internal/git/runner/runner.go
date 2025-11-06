package runner

import (
    "bytes"
    "context"
    "fmt"
    "os/exec"
    "regexp"
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
        return "", fmt.Errorf("git %s: %s", sanitizeArgs(args), redactTokens(msg))
    }
    return out.String(), nil
}

// sanitizeArgs returns a minimal, non-sensitive summary of the git operation.
// It keeps at most the first two subcommand tokens that look like safe words.
func sanitizeArgs(args []string) string {
    if len(args) == 0 { return "<no-args>" }
    safe := make([]string, 0, 2)
    re := regexp.MustCompile(`^[a-z][a-z-]*$`)
    for _, a := range args {
        if re.MatchString(a) {
            safe = append(safe, a)
            if len(safe) == 2 { break }
        } else {
            // stop on first non-safe token to avoid leaking paths/urls
            break
        }
    }
    if len(safe) == 0 { return "<redacted>" }
    return strings.Join(safe, " ")
}

// redactTokens removes obvious credential substrings from messages.
func redactTokens(s string) string {
    // Simple scrubs for URLs with credentials and bearer-like tokens
    s = regexp.MustCompile(`https?://[^\s@]+@`).ReplaceAllString(s, "https://<redacted>@")
    s = regexp.MustCompile(`(?i)(token|secret|password|passwd|bearer)=[^\s]+`).ReplaceAllString(s, "$1=<redacted>")
    return s
}
