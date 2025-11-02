package terminal

import (
    "context"
    "encoding/base64"
    "errors"
    "fmt"
    "io"
    "os"
    "os/exec"
    "path/filepath"
    "runtime"
    "strings"
    "sync"
    "syscall"

    "codex-ui/internal/agents"

    "github.com/creack/pty"
    wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type Manager struct {
    agent *agents.Service
    ctxFn func() context.Context
    mu    sync.Mutex
    terms map[int64]*session
    shell string
}

type session struct {
    threadID int64
    cmd *exec.Cmd
    pty *os.File
    cancel context.CancelFunc
    done chan struct{}
}

func NewManager(agent *agents.Service, ctxProvider func() context.Context, shellPath string) *Manager {
    if strings.TrimSpace(shellPath)=="" { shellPath = detectShell() }
    return &Manager{agent: agent, ctxFn: ctxProvider, terms: map[int64]*session{}, shell: shellPath}
}

func (m *Manager) Start(threadID int64) error {
    if m.agent == nil { return fmt.Errorf("agent service not initialised") }
    thread, err := m.agent.GetThread(context.Background(), threadID)
    if err != nil { return err }
    worktree := strings.TrimSpace(thread.WorktreePath)
    if worktree == "" { return fmt.Errorf("thread %d has no worktree", threadID) }

    m.mu.Lock()
    if existing, ok := m.terms[threadID]; ok { m.mu.Unlock(); if existing.cmd.ProcessState!=nil && existing.cmd.ProcessState.Exited(){ _ = m.Stop(threadID) } else { m.emitReady(threadID); return nil } }
    m.mu.Unlock()

    ctx, cancel := context.WithCancel(context.Background())
    shell := m.shell
    if strings.TrimSpace(shell)=="" { shell = defaultShell() }
    args := shellArgs(shell)
    cmd := exec.CommandContext(ctx, shell, args...)
    cmd.Dir = worktree
    cmd.Env = os.Environ()
    if !envHasKey(cmd.Env, "TERM") { cmd.Env = append(cmd.Env, "TERM=xterm-256color") }
    cmd.Env = append(cmd.Env, fmt.Sprintf("THREAD_ID=%d", threadID))
    ptmx, err := pty.Start(cmd)
    if err != nil { cancel(); return fmt.Errorf("start terminal: %w", err) }

    s := &session{threadID: threadID, cmd: cmd, pty: ptmx, cancel: cancel, done: make(chan struct{})}
    m.mu.Lock(); m.terms[threadID] = s; m.mu.Unlock()
    go m.forward(s)
    m.emitReady(threadID)
    return nil
}

func (m *Manager) Write(threadID int64, data string) error {
    s, ok := m.get(threadID); if !ok { return fmt.Errorf("terminal for thread %d not started", threadID) }
    if _, err := s.pty.Write([]byte(data)); err != nil { return fmt.Errorf("write terminal: %w", err) }
    return nil
}

func (m *Manager) Resize(threadID int64, cols, rows int) error {
    s, ok := m.get(threadID); if !ok { return fmt.Errorf("terminal for thread %d not started", threadID) }
    if err := pty.Setsize(s.pty, &pty.Winsize{Cols: uint16(cols), Rows: uint16(rows)}); err != nil { return fmt.Errorf("resize terminal: %w", err) }
    return nil
}

func (m *Manager) Stop(threadID int64) error {
    s, ok := m.get(threadID); if !ok { return nil }
    s.cancel(); _ = s.pty.Close(); <-s.done; return nil
}

func (m *Manager) CloseAll() {
    m.mu.Lock(); list := make([]*session,0,len(m.terms)); for _, s := range m.terms { list = append(list, s) }; m.terms = map[int64]*session{}; m.mu.Unlock()
    for _, s := range list { if s==nil { continue }; s.cancel(); _ = s.pty.Close(); <-s.done }
}

func (m *Manager) get(threadID int64) (*session, bool) {
    m.mu.Lock(); s, ok := m.terms[threadID]; m.mu.Unlock(); if !ok || s==nil { return nil, false }; return s, true
}

func (m *Manager) forward(s *session) {
    defer func(){ _ = s.pty.Close(); _ = s.cmd.Wait(); close(s.done); m.mu.Lock(); if cur, ok := m.terms[s.threadID]; ok && cur==s { delete(m.terms, s.threadID) }; m.mu.Unlock(); status := "exited"; if s.cmd.ProcessState!=nil && !s.cmd.ProcessState.Success(){ status = fmt.Sprintf("exit:%d", s.cmd.ProcessState.ExitCode()) }; m.emitExit(s.threadID, status) }()
    buf := make([]byte, 4096)
    for {
        n, err := s.pty.Read(buf)
        if n>0 { chunk := make([]byte, n); copy(chunk, buf[:n]); m.emitOutput(s.threadID, chunk) }
        if err != nil {
            if !errors.Is(err, os.ErrClosed) && !errors.Is(err, io.EOF) {
                var errno syscall.Errno
                if !(runtime.GOOS != "windows" && errors.As(err, &errno) && errno == syscall.Errno(5)) { fmt.Printf("terminal read thread %d: %v\n", s.threadID, err) }
            }
            return
        }
    }
}

func (m *Manager) emitReady(threadID int64) { m.emitEvent(threadID, "ready", "", "") }
func (m *Manager) emitExit(threadID int64, status string) { if status=="" { status="exited" }; m.emitEvent(threadID, "exit", "", status) }
func (m *Manager) emitOutput(threadID int64, data []byte) {
    if len(data)==0 { return }
    enc := base64.StdEncoding.EncodeToString(data)
    m.emitEvent(threadID, "output", enc, "")
}
func (m *Manager) emitEvent(threadID int64, typ, data, status string) {
    if m.ctxFn==nil { return }
    payload := struct{ ThreadID int64 `json:"threadId"`; Type string `json:"type"`; Data string `json:"data,omitempty"`; Status string `json:"status,omitempty"`}{ threadID, typ, data, status }
    ctx := m.ctxFn(); if ctx==nil { return }
    wailsruntime.EventsEmit(ctx, agents.TerminalTopic(threadID), payload)
}

func shellArgs(shell string) []string {
    base := filepath.Base(shell)
    switch base {
    case "bash", "zsh", "fish":
        return []string{"-l"}
    case "pwsh", "powershell.exe":
        return []string{"-NoLogo"}
    default:
        return nil
    }
}
func envHasKey(env []string, key string) bool { for _, p := range env { if strings.HasPrefix(p, key+"=") { return true } }; return false }
func detectShell() string { if s := os.Getenv("SHELL"); s!="" { return s }; if runtime.GOOS=="windows" { if c := os.Getenv("COMSPEC"); c!="" { return c }; return "powershell.exe" }; return defaultShell() }
func defaultShell() string { if runtime.GOOS=="windows" { return "powershell.exe" }; if s:=os.Getenv("SHELL"); s!="" { return s }; return "/bin/sh" }

