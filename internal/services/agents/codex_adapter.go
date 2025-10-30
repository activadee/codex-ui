package agents

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/activadee/godex"
)

// CodexAdapter streams turns through the Codex CLI.
type CodexAdapter struct {
	client codexClient
}

// CodexOptionsFromEnv builds Codex options using environment overrides.
func CodexOptionsFromEnv() godex.CodexOptions {
	opts := godex.CodexOptions{
		BaseURL: os.Getenv("CODEX_BASE_URL"),
		APIKey:  os.Getenv("CODEX_API_KEY"),
	}
	if override := strings.TrimSpace(os.Getenv("CODEX_PATH")); override != "" {
		opts.CodexPathOverride = override
	}
	return opts
}

// NewCodexAdapter constructs a streaming adapter using the provided options.
func NewCodexAdapter(options godex.CodexOptions) (*CodexAdapter, error) {
	client, err := newDefaultCodexClient(options)
	if err != nil {
		return nil, err
	}
	return &CodexAdapter{client: client}, nil
}

// Stream implements Adapter.
func (a *CodexAdapter) Stream(ctx context.Context, req MessageRequest) (*StreamResult, error) {
	if req.ThreadOptions.Model == "" {
		return nil, errors.New("threadOptions.model is required")
	}

	threadOpts := godex.ThreadOptions{
		Model:            req.ThreadOptions.Model,
		SandboxMode:      godex.SandboxMode(req.ThreadOptions.SandboxMode),
		WorkingDirectory: req.ThreadOptions.WorkingDirectory,
		SkipGitRepoCheck: req.ThreadOptions.SkipGitRepoCheck,
	}

	thread, err := a.selectThread(req.ThreadExternalID, threadOpts)
	if err != nil {
		return nil, err
	}

	turnOpts, err := buildTurnOptions(req.TurnOptions)
	if err != nil {
		return nil, err
	}

	segments, err := buildSegments(req)
	if err != nil {
		return nil, err
	}

	runnerCtx := ctx
	if runnerCtx == nil {
		runnerCtx = context.Background()
	}

	var result streamResult
	if len(segments) > 0 {
		result, err = thread.RunStreamedInputs(runnerCtx, segments, turnOpts)
	} else {
		result, err = thread.RunStreamed(runnerCtx, req.Input, turnOpts)
	}
	if err != nil {
		return nil, err
	}

	events := make(chan StreamEvent)
	done := make(chan error, 1)

	var closeOnce sync.Once
	closeFn := func() error {
		var closeErr error
		closeOnce.Do(func() {
			closeErr = result.Close()
		})
		return closeErr
	}

	go func() {
		defer close(events)
		defer close(done)

		for {
			select {
			case <-runnerCtx.Done():
				_ = closeFn()
				done <- runnerCtx.Err()
				return
			case evt, ok := <-result.Events():
				if !ok {
					if err := result.Wait(); err != nil {
						done <- err
					} else {
						done <- nil
					}
					return
				}

				streamEvent := convertThreadEvent(evt)

				select {
				case events <- streamEvent:
				case <-runnerCtx.Done():
					_ = closeFn()
					done <- runnerCtx.Err()
					return
				}
			}
		}
	}()

	return &StreamResult{
		Events: events,
		Done:   done,
		Close:  closeFn,
	}, nil
}

func (a *CodexAdapter) selectThread(threadID string, options godex.ThreadOptions) (threadRunner, error) {
	if strings.TrimSpace(threadID) == "" {
		return a.client.StartThread(options), nil
	}
	return a.client.ResumeThread(threadID, options), nil
}

func buildTurnOptions(turn *TurnOptionsDTO) (*godex.TurnOptions, error) {
	if turn == nil {
		return nil, nil
	}
	var schema any
	if len(turn.OutputSchema) > 0 {
		if err := json.Unmarshal(turn.OutputSchema, &schema); err != nil {
			return nil, fmt.Errorf("decode output schema: %w", err)
		}
	}
	opts := &godex.TurnOptions{}
	if schema != nil {
		opts.OutputSchema = schema
	}
	return opts, nil
}

func buildSegments(req MessageRequest) ([]godex.InputSegment, error) {
	if len(req.Segments) == 0 {
		return nil, nil
	}

	segments := make([]godex.InputSegment, 0, len(req.Segments))
	for idx, seg := range req.Segments {
		switch seg.Type {
		case "text":
			if strings.TrimSpace(seg.Text) == "" {
				return nil, fmt.Errorf("segment %d text is empty", idx)
			}
			segments = append(segments, godex.TextSegment(seg.Text))
		case "image":
			if strings.TrimSpace(seg.ImagePath) == "" {
				return nil, fmt.Errorf("segment %d imagePath is empty", idx)
			}
			segments = append(segments, godex.LocalImageSegment(seg.ImagePath))
		default:
			return nil, fmt.Errorf("segment %d has unsupported type %q", idx, seg.Type)
		}
	}
	return segments, nil
}

func convertThreadEvent(evt godex.ThreadEvent) StreamEvent {
	streamEvent := StreamEvent{Type: string(evt.EventType())}

	switch e := evt.(type) {
	case godex.ThreadStartedEvent:
		streamEvent.ThreadID = e.ThreadID
	case godex.ItemStartedEvent:
		streamEvent.Item = convertThreadItem(e.Item)
	case godex.ItemUpdatedEvent:
		streamEvent.Item = convertThreadItem(e.Item)
	case godex.ItemCompletedEvent:
		streamEvent.Item = convertThreadItem(e.Item)
	case godex.TurnCompletedEvent:
		streamEvent.Usage = &UsageDTO{
			InputTokens:       e.Usage.InputTokens,
			CachedInputTokens: e.Usage.CachedInputTokens,
			OutputTokens:      e.Usage.OutputTokens,
		}
	case godex.TurnFailedEvent:
		streamEvent.Error = &StreamError{Message: e.Error.Message}
	case godex.ThreadErrorEvent:
		streamEvent.Error = &StreamError{Message: e.Message}
	}

	return streamEvent
}

func convertThreadItem(item godex.ThreadItem) *AgentItemDTO {
	switch v := item.(type) {
	case godex.AgentMessageItem:
		return &AgentItemDTO{ID: v.ID, Type: v.Type, Text: v.Text}
	case godex.ReasoningItem:
		return &AgentItemDTO{ID: v.ID, Type: v.Type, Reasoning: v.Text}
	case godex.CommandExecutionItem:
		return &AgentItemDTO{
			ID:   v.ID,
			Type: v.Type,
			Command: &CommandExecutionDTO{
				Command:          v.Command,
				AggregatedOutput: v.AggregatedOutput,
				ExitCode:         v.ExitCode,
				Status:           string(v.Status),
			},
		}
	case godex.FileChangeItem:
		changes := make([]FileChangeDTO, 0, len(v.Changes))
		for _, change := range v.Changes {
			changes = append(changes, FileChangeDTO{
				Path:   change.Path,
				Kind:   string(change.Kind),
				Status: string(v.Status),
			})
		}
		return &AgentItemDTO{ID: v.ID, Type: v.Type, FileDiffs: changes}
	case godex.McpToolCallItem:
		return &AgentItemDTO{
			ID:   v.ID,
			Type: v.Type,
			ToolCall: &ToolCallDTO{
				Server: v.Server,
				Tool:   v.Tool,
				Status: string(v.Status),
			},
		}
	case godex.WebSearchItem:
		return &AgentItemDTO{ID: v.ID, Type: v.Type, WebSearch: &WebSearchDTO{Query: v.Query}}
	case godex.TodoListItem:
		items := make([]TodoItemDTO, 0, len(v.Items))
		for _, todo := range v.Items {
			items = append(items, TodoItemDTO{Text: todo.Text, Completed: todo.Completed})
		}
		return &AgentItemDTO{ID: v.ID, Type: v.Type, TodoList: &TodoListDTO{Items: items}}
	case godex.ErrorItem:
		return &AgentItemDTO{ID: v.ID, Type: v.Type, Error: &ErrorItemDTO{Message: v.Message}}
	default:
		return &AgentItemDTO{Type: fmt.Sprintf("unknown:%T", item)}
	}
}

// Interfaces to ease testing.
type codexClient interface {
	StartThread(options godex.ThreadOptions) threadRunner
	ResumeThread(id string, options godex.ThreadOptions) threadRunner
}

type threadRunner interface {
	ID() string
	RunStreamed(ctx context.Context, input string, turnOptions *godex.TurnOptions) (streamResult, error)
	RunStreamedInputs(ctx context.Context, segments []godex.InputSegment, turnOptions *godex.TurnOptions) (streamResult, error)
}

type streamResult interface {
	Events() <-chan godex.ThreadEvent
	Wait() error
	Close() error
}

type defaultCodexClient struct {
	codex *godex.Codex
}

func newDefaultCodexClient(options godex.CodexOptions) (codexClient, error) {
	instance, err := godex.New(options)
	if err != nil {
		return nil, err
	}
	return &defaultCodexClient{codex: instance}, nil
}

func (c *defaultCodexClient) StartThread(options godex.ThreadOptions) threadRunner {
	return &defaultThread{thread: c.codex.StartThread(options)}
}

func (c *defaultCodexClient) ResumeThread(id string, options godex.ThreadOptions) threadRunner {
	return &defaultThread{thread: c.codex.ResumeThread(id, options)}
}

type defaultThread struct {
	thread *godex.Thread
}

func (t *defaultThread) ID() string {
	return t.thread.ID()
}

func (t *defaultThread) RunStreamed(ctx context.Context, input string, turnOptions *godex.TurnOptions) (streamResult, error) {
	result, err := t.thread.RunStreamed(ctx, input, turnOptions)
	if err != nil {
		return nil, err
	}
	return defaultStreamResult{result: result}, nil
}

func (t *defaultThread) RunStreamedInputs(ctx context.Context, segments []godex.InputSegment, turnOptions *godex.TurnOptions) (streamResult, error) {
	result, err := t.thread.RunStreamedInputs(ctx, segments, turnOptions)
	if err != nil {
		return nil, err
	}
	return defaultStreamResult{result: result}, nil
}

type defaultStreamResult struct {
	result godex.RunStreamedResult
}

func (r defaultStreamResult) Events() <-chan godex.ThreadEvent {
	return r.result.Events()
}

func (r defaultStreamResult) Wait() error {
	return r.result.Wait()
}

func (r defaultStreamResult) Close() error {
	return r.result.Close()
}
