package agents

import (
    "context"
    "fmt"
    "strings"
    "time"
)

type prStream struct {
    Events <-chan StreamEvent
    Done   <-chan error
    Close  func() error
}

// BuildCreatePRInstruction composes the instruction sent to the agent to create a PR.
func BuildCreatePRInstruction(branchName string) string {
    return fmt.Sprintf(`You are operating in a git worktree branch for this thread.
Task:
1) Review all staged and unstaged changes.
2) Group logically and create conventional commits (feat|fix|chore|refactor|docs|test) with meaningful scope and messages.
3) Push the branch '%s' to origin and ensure upstream is set.
4) Create or update a GitHub pull request from this branch against the default base branch.
   - Use a conventional title.
   - Write a clear, structured description that summarizes the changes.

Constraints:
- Prefer the GitHub CLI (gh). If a PR already exists for the branch, update it.
- Do not print secrets or token values.

Output:
- After completion print exactly one line with: PR_URL: https://github.com/<owner>/<repo>/pull/<number>
- Do not include any other lines after the PR_URL line.`, branchName)
}

// StartBackgroundPRStream starts a background agent run to create a PR.
func StartBackgroundPRStream(worktree, sandboxMode, instruction string) (*prStream, error) {
    adapter, err := NewCodexAdapter(CodexOptionsFromEnv())
    if err != nil { return nil, fmt.Errorf("initialise codex adapter: %w", err) }
    sandbox := strings.TrimSpace(sandboxMode)
    if sandbox == "" { sandbox = "workspace-write" }
    req := MessageRequest{ ThreadOptions: ThreadOptionsDTO{ Model: "gpt-5.1-codex", SandboxMode: sandbox, ReasoningLevel: "medium", WorkingDirectory: worktree, SkipGitRepoCheck: false }, Input: instruction }
    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
    res, err := adapter.Stream(ctx, req)
    if err != nil { cancel(); return nil, err }
    wrappedClose := func() error { cancel(); if res.Close!=nil { return res.Close() }; return nil }
    return &prStream{Events: res.Events, Done: res.Done, Close: wrappedClose}, nil
}
