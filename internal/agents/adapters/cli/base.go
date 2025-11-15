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
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"codex-ui/internal/agents/connector"
)

// Adapter launches a CLI agent command and exposes connector semantics.
type Adapter struct {
	Identifier       string
	Cmd              string
	Args             []string
	Env              map[string]string
	BaseCapabilities connector.CapabilitySet
}

// ID returns a stable identifier for registry lookups.
func (a *Adapter) ID() string {
	if trimmed := strings.TrimSpace(a.Identifier); trimmed != "" {
		return trimmed
	}
	name := strings.TrimSpace(a.Cmd)
	if name == "" {
		return "cli"
	}
	base := filepath.Base(name)
	if base == "" {
		base = name
	}
	sanitized := strings.ReplaceAll(base, " ", "-")
	return "cli:" + sanitized
}

// Capabilities returns the advertised feature set for this adapter.
func (a *Adapter) Capabilities() connector.CapabilitySet {
	return a.capabilities()
}

// Info returns static metadata for the adapter.
func (a *Adapter) Info(ctx context.Context) (string, string, connector.CapabilitySet, error) {
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

func (a *Adapter) capabilities() connector.CapabilitySet {
	if len(a.BaseCapabilities) > 0 {
		return a.BaseCapabilities.Clone()
	}
	return connector.CapabilitySet{connector.CapabilitySupportsAttachments: true}
}

// Start spawns the CLI command wired to the provided session options.
func (a *Adapter) Start(ctx context.Context, opts connector.SessionOptions) (connector.Session, error) {
	if ctx == nil {
		ctx = context.Background()
	}
	name := strings.TrimSpace(a.Cmd)
	if name == "" {
		return nil, errors.New("cmd is required")
	}
	cmd := exec.CommandContext(ctx, name, a.Args...)
	if opts.WorkingDirectory != "" {
		cmd.Dir = opts.WorkingDirectory
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
		id:      fmt.Sprintf("cli-%d", time.Now().UnixNano()),
		cmd:     cmd,
		stdin:   stdin,
		evts:    make(chan connector.Event, 256),
		caps:    a.capabilities(),
		stopped: atomic.Bool{},
	}
	sess.wg.Add(2)
	go sess.read(stdout, false)
	go sess.read(stderr, true)
	go sess.wait()
	return sess, nil
}

type session struct {
	id      string
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	evts    chan connector.Event
	caps    connector.CapabilitySet
	mu      sync.Mutex
	close   sync.Once
	wg      sync.WaitGroup
	stopped atomic.Bool
}

func (s *session) ID() string                            { return s.id }
func (s *session) Capabilities() connector.CapabilitySet { return s.caps }
func (s *session) Events() <-chan connector.Event        { return s.evts }

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
		s.stopped.Store(true)
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
			if evt, ok := parseCLIEvent(text); ok {
				s.emit(evt)
			} else {
				s.emit(basicTextEvent(text, isErr))
			}
		}
		if err != nil {
			if s.stopped.Load() {
				return
			}
			if !errors.Is(err, io.EOF) {
				s.emit(connector.Event{
					Type:      connector.EventTypeSessionError,
					Timestamp: time.Now(),
					Message:   err.Error(),
					Error:     &connector.EventError{Message: err.Error()},
				})
			}
			return
		}
	}
}

func (s *session) wait() {
	err := s.cmd.Wait()
	s.wg.Wait()
	stopped := s.stopped.Load()
	if err != nil {
		if stopped || errors.Is(err, context.Canceled) {
			err = nil
		}
	}
	code := 0
	if s.cmd.ProcessState != nil {
		code = s.cmd.ProcessState.ExitCode()
	}
	msg := ""
	if err != nil {
		msg = err.Error()
	}
	evtType := connector.EventTypeCustom
	if err != nil {
		evtType = connector.EventTypeSessionError
	}
	event := connector.Event{
		Type:      evtType,
		Timestamp: time.Now(),
		Message:   fmt.Sprintf("cli exited with code %d", code),
		Metadata:  map[string]any{"exitCode": code},
	}
	if stopped {
		event.Metadata["stopped"] = true
	}
	if msg != "" {
		event.Error = &connector.EventError{Message: msg}
	}
	s.emit(event)
	close(s.evts)
}

func parseCLIEvent(line string) (connector.Event, bool) {
	var raw map[string]any
	if err := json.Unmarshal([]byte(line), &raw); err != nil {
		return connector.Event{}, false
	}
	typeStr := resolveCLIEventType(raw)
	if typeStr == "" {
		return connector.Event{}, false
	}
	event := connector.Event{
		Type:      connector.EventType(typeStr),
		Timestamp: time.Now(),
		Metadata:  raw,
	}
	if msg, ok := stringField(raw, "message"); ok {
		event.Message = msg
	}
	if text, ok := stringField(raw, "text"); ok {
		event.Message = text
		if event.Payload == nil {
			event.Payload = &connector.AgentMessage{Role: connector.PromptAuthorAssistant, Text: text}
		}
	}
	if plan, ok := stringField(raw, "plan"); ok {
		event.Message = plan
	}
	if promptID, ok := stringField(raw, "promptId"); ok {
		event.PromptID = promptID
	}
	if threadID, ok := stringField(raw, "threadId"); ok {
		event.ThreadID = threadID
	}
	if usage := usageFromRaw(raw); usage != nil {
		event.Usage = usage
	}
	if errMsg, ok := stringField(raw, "err"); ok {
		event.Error = &connector.EventError{Message: errMsg}
	}
	return event, true
}

func basicTextEvent(text string, isErr bool) connector.Event {
	evt := connector.Event{
		Timestamp: time.Now(),
		Message:   text,
	}
	if isErr {
		evt.Type = connector.EventTypeSessionError
		evt.Error = &connector.EventError{Message: text}
	} else {
		evt.Type = connector.EventTypeItemUpdated
		evt.Payload = &connector.AgentMessage{Role: connector.PromptAuthorAssistant, Text: text}
	}
	return evt
}

func resolveCLIEventType(raw map[string]any) string {
	if t, ok := stringField(raw, "kind"); ok {
		if mapped := mapKnownCLIType(t); mapped != "" {
			return mapped
		}
		return t
	}
	if t, ok := stringField(raw, "type"); ok {
		if mapped := mapKnownCLIType(t); mapped != "" {
			return mapped
		}
		return t
	}
	return ""
}

func mapKnownCLIType(value string) string {
	switch value {
	case "text_chunk", "text":
		return string(connector.EventTypeItemUpdated)
	case "plan_update", "plan.updated":
		return string(connector.EventTypePlanUpdated)
	case "tool_call", "tool.started":
		return string(connector.EventTypeToolStarted)
	case "tool_completed":
		return string(connector.EventTypeToolCompleted)
	case "diff", "diff.summary":
		return string(connector.EventTypeDiffSummary)
	case "usage", "usage.updated":
		return string(connector.EventTypeUsageUpdated)
	case "error", "session.error":
		return string(connector.EventTypeSessionError)
	case "complete", "turn.completed":
		return string(connector.EventTypeTurnCompleted)
	case "start", "session.started":
		return string(connector.EventTypeSessionStarted)
	default:
		return ""
	}
}

func stringField(raw map[string]any, key string) (string, bool) {
	if value, ok := raw[key]; ok {
		if text, ok := value.(string); ok {
			return text, true
		}
	}
	return "", false
}

func usageFromRaw(raw map[string]any) *connector.TokenUsage {
	usageValue, ok := raw["usage"].(map[string]any)
	if !ok || len(usageValue) == 0 {
		return nil
	}
	usage := connector.TokenUsage{}
	if v, ok := floatField(usageValue, "input"); ok {
		usage.InputTokens = v
	}
	if v, ok := floatField(usageValue, "cached"); ok {
		usage.CachedInputTokens = v
	}
	if v, ok := floatField(usageValue, "output"); ok {
		usage.OutputTokens = v
	}
	return &usage
}

func floatField(raw map[string]any, key string) (int, bool) {
	value, ok := raw[key]
	if !ok {
		return 0, false
	}
	switch v := value.(type) {
	case float64:
		return int(v), true
	case int:
		return v, true
	case json.Number:
		parsed, err := v.Int64()
		if err == nil {
			return int(parsed), true
		}
	}
	return 0, false
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
