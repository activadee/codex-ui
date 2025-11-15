package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"codex-ui/internal/agents/connector"
)

// Adapter launches a CLI agent command and exposes connector semantics.
type Adapter struct {
	Cmd          string
	Args         []string
	Env          map[string]string
	Capabilities connector.Capabilities
}

// Info returns static metadata for the adapter.
func (a *Adapter) Info(ctx context.Context) (string, string, connector.Capabilities, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	name := strings.TrimSpace(a.Cmd)
	if name == "" {
		return "", "", nil, errors.New("cmd is required")
	}
	version := "unknown"
	return name, version, a.capabilities(), nil
}

func (a *Adapter) capabilities() connector.Capabilities {
	if len(a.Capabilities) > 0 {
		return a.Capabilities
	}
	return connector.Capabilities{"tools": true}
}

// Start spawns the CLI command wired to the provided session options.
func (a *Adapter) Start(ctx context.Context, opts connector.SessionOptions) (connector.Session, error) {
	name := strings.TrimSpace(a.Cmd)
	if name == "" {
		return nil, errors.New("cmd is required")
	}
	cmd := exec.CommandContext(ctx, name, a.Args...)
	if opts.WorkspaceRoot != "" {
		cmd.Dir = opts.WorkspaceRoot
	}
	env := append([]string{}, os.Environ()...)
	env = append(env, formatEnvMap(a.Env)...)
	env = append(env, formatEnvMap(opts.Env)...)
	cmd.Env = env

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	sess := &session{
		id:    fmt.Sprintf("cli-%d", time.Now().UnixNano()),
		cmd:   cmd,
		stdin: stdin,
		evts:  make(chan connector.Event, 256),
		caps:  a.capabilities(),
	}
	sess.wg.Add(2)
	go sess.read(stdout, false)
	go sess.read(stderr, true)
	go sess.wait()
	return sess, nil
}

type session struct {
	id    string
	cmd   *exec.Cmd
	stdin io.WriteCloser
	evts  chan connector.Event
	caps  connector.Capabilities
	mu    sync.Mutex
	close sync.Once
	wg    sync.WaitGroup
}

func (s *session) ID() string                           { return s.id }
func (s *session) Capabilities() connector.Capabilities { return s.caps }
func (s *session) Events() <-chan connector.Event       { return s.evts }
func (s *session) Stdin() io.WriteCloser                { return s.stdin }

func (s *session) Send(ctx context.Context, prompts ...connector.Prompt) error {
	if len(prompts) == 0 {
		return nil
	}
	if ctx == nil {
		ctx = context.Background()
	}
	payload := struct {
		Type    string             `json:"type"`
		Prompts []connector.Prompt `json:"prompts"`
	}{Type: "prompt", Prompts: prompts}
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	done := make(chan error, 1)
	go func(payload []byte) {
		s.mu.Lock()
		defer s.mu.Unlock()
		_, writeErr := s.stdin.Write(payload)
		done <- writeErr
	}(append(data, '\n'))
	select {
	case err := <-done:
		return err
	case <-ctx.Done():
		_ = s.Close()
		return ctx.Err()
	}
}

func (s *session) Close() error {
	s.close.Do(func() {
		if s.stdin != nil {
			_ = s.stdin.Close()
		}
		if s.cmd != nil && s.cmd.Process != nil {
			_ = s.cmd.Process.Kill()
		}
	})
	return nil
}

func (s *session) read(r io.Reader, isErr bool) {
	defer s.wg.Done()
	reader := bufio.NewReader(r)
	for {
		line, err := reader.ReadBytes('\n')
		if len(line) > 0 {
			text := strings.TrimRight(string(line), "\r\n")
			if evt, ok := tryJSONEvent(text); ok {
				s.emit(evt)
			} else {
				kind := connector.EventTextChunk
				if isErr {
					kind = connector.EventError
				}
				s.emit(connector.Event{Kind: kind, At: time.Now(), Text: text})
			}
		}
		if err != nil {
			if !errors.Is(err, io.EOF) {
				s.emit(connector.Event{Kind: connector.EventError, At: time.Now(), Err: err.Error()})
			}
			return
		}
	}
}

func (s *session) wait() {
	err := s.cmd.Wait()
	s.wg.Wait()
	code := 0
	if s.cmd.ProcessState != nil {
		code = s.cmd.ProcessState.ExitCode()
	}
	msg := ""
	if err != nil && !errors.Is(err, context.Canceled) {
		msg = err.Error()
	}
	s.emit(connector.Event{Kind: connector.EventExit, At: time.Now(), Code: code, Err: msg})
	close(s.evts)
}

func tryJSONEvent(line string) (connector.Event, bool) {
	var raw map[string]any
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		return connector.Event{}, false
	}
	kind, _ := raw["kind"].(string)
	if strings.TrimSpace(kind) == "" {
		if alt, ok := raw["type"].(string); ok {
			kind = alt
		}
	}
	if strings.TrimSpace(kind) == "" {
		return connector.Event{}, false
	}
	evt := connector.Event{Kind: connector.EventKind(kind), At: time.Now(), Meta: raw}
	if text, ok := raw["text"].(string); ok {
		evt.Text = text
	}
	if plan, ok := raw["plan"].(string); ok {
		evt.Plan = plan
	}
	if name, ok := raw["toolName"].(string); ok {
		evt.ToolName = name
	}
	if args, ok := raw["toolArgs"]; ok {
		evt.ToolArgs = args
	}
	if diff, ok := raw["diffUnified"].(string); ok {
		evt.DiffUnified = diff
	}
	if path, ok := raw["filePath"].(string); ok {
		evt.FilePath = path
	}
	if img, ok := raw["imagePath"].(string); ok {
		evt.ImagePath = img
	}
	if code, ok := raw["code"].(float64); ok {
		evt.Code = int(code)
	}
	if errMsg, ok := raw["err"].(string); ok {
		evt.Err = errMsg
	}
	return evt, true
}

func (s *session) emit(evt connector.Event) {
	s.evts <- evt
}

func formatEnvMap(values map[string]string) []string {
	if len(values) == 0 {
		return nil
	}
	result := make([]string, 0, len(values))
	for key, value := range values {
		result = append(result, fmt.Sprintf("%s=%s", key, value))
	}
	return result
}
