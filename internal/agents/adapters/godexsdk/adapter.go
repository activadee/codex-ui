package godexsdk

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/activadee/godex"

	"codex-ui/internal/agents/connector"
)

const defaultModel = "gpt-5"

var capabilityDefaults = connector.CapabilitySet{
	connector.CapabilitySupportsImages:        true,
	connector.CapabilitySupportsReasoning:     true,
	connector.CapabilitySupportsSandbox:       true,
	connector.CapabilityEmitsDiffs:            true,
	connector.CapabilitySupportsAttachments:   true,
	connector.CapabilitySupportsCustomSchemas: true,
}

// Adapter wraps the godex SDK and exposes connector semantics.
type Adapter struct {
	CodexPathOverride string
	BaseURL           string
	APIKey            string
	Model             string
	ConfigOverrides   map[string]any
}

// ID returns the logical identifier for this adapter.
func (a *Adapter) ID() string {
	return "codex"
}

// Capabilities advertises the supported feature set.
func (a *Adapter) Capabilities() connector.CapabilitySet {
	return capabilityDefaults.Clone()
}

// Info reports metadata for registry listing.
func (a *Adapter) Info(ctx context.Context) (string, string, connector.CapabilitySet, error) {
	return "Codex (godex SDK)", "unknown", a.Capabilities(), nil
}

// Start initialises a godex thread session.
func (a *Adapter) Start(ctx context.Context, opts connector.SessionOptions) (connector.Session, error) {
	client, err := godex.New(godex.CodexOptions{
		CodexPathOverride: a.CodexPathOverride,
		BaseURL:           a.BaseURL,
		APIKey:            a.APIKey,
		ConfigOverrides:   a.ConfigOverrides,
	})
	if err != nil {
		return nil, err
	}

	threadOpts := buildThreadOptions(opts, a.Model)
	threadID := threadIdentifier(opts)
	var thread *godex.Thread
	if threadID != "" {
		thread = client.ResumeThread(threadID, threadOpts)
	} else {
		thread = client.StartThread(threadOpts)
	}

	sess := &session{
		thread: thread,
		evts:   make(chan connector.Event, 256),
		caps:   a.Capabilities(),
	}
	sess.setThreadID(thread.ID())
	return sess, nil
}

type session struct {
	thread *godex.Thread
	evts   chan connector.Event
	caps   connector.CapabilitySet

	idMu sync.RWMutex
	id   string

	stateMu sync.Mutex
	running bool
	closed  bool
	current *godex.RunStreamedResult

	wg        sync.WaitGroup
	closeOnce sync.Once
}

func (s *session) Events() <-chan connector.Event {
	return s.evts
}

func (s *session) Capabilities() connector.CapabilitySet {
	return s.caps.Clone()
}

func (s *session) Send(ctx context.Context, prompts ...connector.Prompt) error {
	if len(prompts) == 0 {
		return errors.New("prompt is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	segments, fallback := promptsToInputs(prompts)
	if len(segments) == 0 && strings.TrimSpace(fallback) == "" {
		return errors.New("prompt has no content")
	}
	turnOpts, err := buildTurnOptions(prompts)
	if err != nil {
		return err
	}

	s.stateMu.Lock()
	if s.closed {
		s.stateMu.Unlock()
		return errors.New("session closed")
	}
	if s.running {
		s.stateMu.Unlock()
		return errors.New("turn in progress")
	}
	s.running = true
	s.stateMu.Unlock()

	var result godex.RunStreamedResult
	if len(segments) > 0 {
		result, err = s.thread.RunStreamedInputs(ctx, segments, turnOpts)
	} else {
		result, err = s.thread.RunStreamed(ctx, fallback, turnOpts)
	}
	if err != nil {
		s.stateMu.Lock()
		s.running = false
		s.stateMu.Unlock()
		return err
	}

	s.stateMu.Lock()
	current := result
	s.current = &current
	s.stateMu.Unlock()

	s.wg.Add(1)
	go s.consume(result)
	return nil
}

func (s *session) Close() error {
	s.closeOnce.Do(func() {
		s.stateMu.Lock()
		s.closed = true
		var current *godex.RunStreamedResult
		if s.current != nil {
			current = s.current
		}
		s.stateMu.Unlock()
		if current != nil {
			_ = current.Close()
		}
		s.wg.Wait()
		close(s.evts)
	})
	return nil
}

func (s *session) consume(result godex.RunStreamedResult) {
	defer s.wg.Done()
	defer func() {
		_ = result.Close()
		s.stateMu.Lock()
		s.running = false
		s.current = nil
		s.stateMu.Unlock()
	}()

	for event := range result.Events() {
		if started, ok := event.(godex.ThreadStartedEvent); ok {
			s.setThreadID(started.ThreadID)
		}
		converted := convertThreadEvent(event, s.threadID())
		if converted.Type == "" {
			continue
		}
		s.emit(converted)
	}

	if err := result.Wait(); err != nil {
		s.emit(connector.Event{
			Type:      connector.EventTypeSessionError,
			ThreadID:  s.threadID(),
			Timestamp: time.Now(),
			Message:   err.Error(),
			Error:     &connector.EventError{Message: err.Error()},
		})
	}
}

func (s *session) emit(evt connector.Event) {
	select {
	case s.evts <- evt:
	default:
		s.evts <- evt
	}
}

func (s *session) threadID() string {
	s.idMu.RLock()
	defer s.idMu.RUnlock()
	return s.id
}

func (s *session) setThreadID(id string) {
	if strings.TrimSpace(id) == "" {
		return
	}
	s.idMu.Lock()
	s.id = id
	s.idMu.Unlock()
}

func buildThreadOptions(opts connector.SessionOptions, adapterModel string) godex.ThreadOptions {
	model := selectModel(opts, adapterModel)
	workingDir := strings.TrimSpace(opts.WorkingDirectory)
	if workingDir == "" {
		workingDir = strings.TrimSpace(opts.Thread.WorktreePath)
	}
	return godex.ThreadOptions{
		Model:            model,
		SandboxMode:      parseSandboxMode(opts.SandboxMode),
		WorkingDirectory: workingDir,
		SkipGitRepoCheck: opts.SkipGitRepoCheck,
	}
}

func selectModel(opts connector.SessionOptions, adapterModel string) string {
	if val := metadataString(opts.Metadata, "model"); val != "" {
		return val
	}
	if strings.TrimSpace(opts.Thread.Model) != "" {
		return strings.TrimSpace(opts.Thread.Model)
	}
	if strings.TrimSpace(adapterModel) != "" {
		return strings.TrimSpace(adapterModel)
	}
	return defaultModel
}

func parseSandboxMode(value string) godex.SandboxMode {
	normalized := strings.TrimSpace(strings.ToLower(value))
	switch normalized {
	case strings.ToLower(string(godex.SandboxModeReadOnly)):
		return godex.SandboxModeReadOnly
	case strings.ToLower(string(godex.SandboxModeDangerFullAccess)):
		return godex.SandboxModeDangerFullAccess
	case strings.ToLower(string(godex.SandboxModeWorkspaceWrite)):
		return godex.SandboxModeWorkspaceWrite
	default:
		return godex.SandboxModeWorkspaceWrite
	}
}

func threadIdentifier(opts connector.SessionOptions) string {
	if id := strings.TrimSpace(opts.Thread.ExternalID); id != "" {
		return id
	}
	return metadataString(opts.Metadata, "threadExternalId")
}

func buildTurnOptions(prompts []connector.Prompt) (*godex.TurnOptions, error) {
	schemaRaw := findSchema(prompts)
	if len(schemaRaw) == 0 {
		return nil, nil
	}
	var schema any
	if err := json.Unmarshal(schemaRaw, &schema); err != nil {
		return nil, fmt.Errorf("decode output schema: %w", err)
	}
	return &godex.TurnOptions{OutputSchema: schema}, nil
}

func findSchema(prompts []connector.Prompt) []byte {
	for _, prompt := range prompts {
		if data, ok := metadataBytes(prompt.Metadata, "outputSchema"); ok {
			return data
		}
	}
	return nil
}

func metadataBytes(meta map[string]any, key string) ([]byte, bool) {
	if len(meta) == 0 {
		return nil, false
	}
	value, ok := meta[key]
	if !ok {
		return nil, false
	}
	switch v := value.(type) {
	case []byte:
		if len(v) == 0 {
			return nil, false
		}
		return v, true
	case json.RawMessage:
		if len(v) == 0 {
			return nil, false
		}
		return v, true
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return nil, false
		}
		return []byte(trimmed), true
	default:
		data, err := json.Marshal(v)
		if err != nil || len(data) == 0 {
			return nil, false
		}
		return data, true
	}
}

func metadataString(meta map[string]any, key string) string {
	if len(meta) == 0 {
		return ""
	}
	value, ok := meta[key]
	if !ok {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []byte:
		return strings.TrimSpace(string(v))
	case json.RawMessage:
		return strings.TrimSpace(string(v))
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func promptsToInputs(prompts []connector.Prompt) ([]godex.InputSegment, string) {
	var segments []godex.InputSegment
	var fallback []string
	for _, prompt := range prompts {
		for _, segment := range prompt.Segments {
			switch segment.Kind {
			case connector.SegmentKindImageLocal:
				if path := strings.TrimSpace(segment.Path); path != "" {
					segments = append(segments, godex.LocalImageSegment(path))
				}
			case connector.SegmentKindCode:
				segments = append(segments, godex.TextSegment(codeBlock(segment.Lang, segment.Text)))
			case connector.SegmentKindMarkdown, connector.SegmentKindText:
				if segment.Text != "" {
					segments = append(segments, godex.TextSegment(segment.Text))
				}
			default:
				if segment.Text != "" {
					fallback = append(fallback, segment.Text)
				}
			}
		}
	}
	if len(segments) > 0 {
		return segments, ""
	}
	return nil, strings.Join(fallback, "\n\n")
}

func codeBlock(lang, body string) string {
	trimmed := strings.TrimSpace(lang)
	if trimmed == "" {
		return fmt.Sprintf("```\n%s\n```", body)
	}
	return fmt.Sprintf("```%s\n%s\n```", trimmed, body)
}

func convertThreadEvent(event godex.ThreadEvent, threadID string) connector.Event {
	converted := connector.Event{
		ThreadID:  threadID,
		Type:      connector.EventTypeCustom,
		Timestamp: time.Now(),
	}
	switch e := event.(type) {
	case godex.ThreadStartedEvent:
		converted.Type = connector.EventTypeSessionStarted
		converted.ThreadID = e.ThreadID
	case godex.TurnStartedEvent:
		converted.Type = connector.EventTypeTurnStarted
	case godex.TurnCompletedEvent:
		converted.Type = connector.EventTypeTurnCompleted
		converted.Usage = &connector.TokenUsage{
			InputTokens:       e.Usage.InputTokens,
			CachedInputTokens: e.Usage.CachedInputTokens,
			OutputTokens:      e.Usage.OutputTokens,
		}
	case godex.TurnFailedEvent:
		converted.Type = connector.EventTypeTurnFailed
		if e.Error.Message != "" {
			converted.Message = e.Error.Message
			converted.Error = &connector.EventError{Message: e.Error.Message}
		}
	case godex.ItemStartedEvent:
		converted.Type = connector.EventTypeItemCreated
		converted.Payload, converted.Message = convertThreadItem(e.Item)
	case godex.ItemUpdatedEvent:
		converted.Type = connector.EventTypeItemUpdated
		converted.Payload, converted.Message = convertThreadItem(e.Item)
	case godex.ItemCompletedEvent:
		converted.Type = connector.EventTypeItemCompleted
		converted.Payload, converted.Message = convertThreadItem(e.Item)
	case godex.ThreadErrorEvent:
		converted.Type = connector.EventTypeSessionError
		converted.Message = e.Message
		converted.Error = &connector.EventError{Message: e.Message}
	}
	return converted
}

func convertThreadItem(item godex.ThreadItem) (connector.EventPayload, string) {
	switch v := item.(type) {
	case godex.AgentMessageItem:
		return &connector.AgentMessage{ID: v.ID, Role: connector.PromptAuthorAssistant, Text: v.Text}, v.Text
	case godex.ReasoningItem:
		return &connector.AgentMessage{ID: v.ID, Role: connector.PromptAuthorAssistant, Reasoning: v.Text}, v.Text
	case godex.CommandExecutionItem:
		return &connector.CommandRun{ID: v.ID, Command: v.Command, Output: v.AggregatedOutput, ExitCode: v.ExitCode, Status: string(v.Status)}, v.AggregatedOutput
	case godex.FileChangeItem:
		changes := make([]connector.FileChange, 0, len(v.Changes))
		for _, change := range v.Changes {
			changes = append(changes, connector.FileChange{Path: change.Path, Kind: string(change.Kind), Status: string(v.Status)})
		}
		return &connector.DiffChunk{ID: v.ID, Changes: changes}, ""
	case godex.McpToolCallItem:
		return &connector.ToolCall{ID: v.ID, Server: v.Server, Tool: v.Tool, Status: string(v.Status)}, ""
	case godex.WebSearchItem:
		return &connector.WebSearch{ID: v.ID, Query: v.Query}, v.Query
	case godex.TodoListItem:
		items := make([]connector.TodoItem, 0, len(v.Items))
		for _, item := range v.Items {
			items = append(items, connector.TodoItem{Text: item.Text, Completed: item.Completed})
		}
		return &connector.TodoList{ID: v.ID, Items: items}, ""
	case godex.ErrorItem:
		return &connector.ErrorItem{ID: v.ID, Message: v.Message}, v.Message
	default:
		return nil, ""
	}
}
