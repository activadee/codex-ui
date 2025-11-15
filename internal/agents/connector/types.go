package connector

import (
	"context"
	"time"

	"codex-ui/internal/storage/discovery"
)

// Adapter represents a backend capable of starting agent sessions.
type Adapter interface {
	ID() string
	Start(ctx context.Context, opts SessionOptions) (Session, error)
	Capabilities() CapabilitySet
}

// Session is a long-lived interaction channel with an agent.
type Session interface {
	Send(ctx context.Context, prompts ...Prompt) error
	Events() <-chan Event
	Capabilities() CapabilitySet
	Close() error
}

// Capability describes a feature toggle advertised by adapters and sessions.
type Capability string

const (
	CapabilitySupportsImages        Capability = "supportsImages"
	CapabilitySupportsReasoning     Capability = "supportsReasoningLevel"
	CapabilitySupportsSandbox       Capability = "supportsSandbox"
	CapabilityEmitsDiffs            Capability = "emitsDiffs"
	CapabilityEmitsTerminal         Capability = "emitsTerminal"
	CapabilitySupportsApplyChanges  Capability = "supportsApply"
	CapabilitySupportsAttachments   Capability = "supportsAttachments"
	CapabilitySupportsCustomSchemas Capability = "supportsCustomSchemas"
)

// CapabilitySet is a convenience map to check adapter features.
type CapabilitySet map[Capability]bool

// Has reports whether the capability is enabled.
func (c CapabilitySet) Has(cap Capability) bool {
	if len(c) == 0 {
		return false
	}
	return c[cap]
}

// Clone returns a defensive copy of the capability set.
func (c CapabilitySet) Clone() CapabilitySet {
	if len(c) == 0 {
		return nil
	}
	clone := make(CapabilitySet, len(c))
	for key, value := range c {
		clone[key] = value
	}
	return clone
}

// SessionOptions bundles contextual metadata required to open a session.
type SessionOptions struct {
	ProjectID        int64
	Thread           discovery.Thread
	WorkingDirectory string
	SandboxMode      string
	SkipGitRepoCheck bool
	Env              map[string]string
	Metadata         map[string]any
}

// PromptAuthor marks the origin of a prompt.
type PromptAuthor string

const (
	PromptAuthorSystem    PromptAuthor = "system"
	PromptAuthorUser      PromptAuthor = "user"
	PromptAuthorAssistant PromptAuthor = "assistant"
	PromptAuthorTool      PromptAuthor = "tool"
)

// SegmentKind enumerates supported segment types.
type SegmentKind string

const (
	SegmentKindText          SegmentKind = "text"
	SegmentKindCode          SegmentKind = "code"
	SegmentKindMarkdown      SegmentKind = "markdown"
	SegmentKindImageLocal    SegmentKind = "imageLocal"
	SegmentKindAttachmentRef SegmentKind = "attachmentRef"
)

// PromptSegment represents a structured portion of a prompt.
type PromptSegment struct {
	Kind SegmentKind
	Text string
	Path string
	Lang string
	Meta map[string]any
}

// Prompt describes the logical payload sent to a session.
type Prompt struct {
	ID       string
	Author   PromptAuthor
	Segments []PromptSegment
	Metadata map[string]any
}

// EventType enumerates stream events shared with the UI/runtime.
type EventType string

const (
	EventTypeSessionStarted EventType = "session.started"
	EventTypeSessionError   EventType = "session.error"
	EventTypeTurnStarted    EventType = "turn.started"
	EventTypeTurnCompleted  EventType = "turn.completed"
	EventTypeTurnFailed     EventType = "turn.failed"
	EventTypeItemCreated    EventType = "item.created"
	EventTypeItemUpdated    EventType = "item.updated"
	EventTypeItemCompleted  EventType = "item.completed"
	EventTypePlanUpdated    EventType = "plan.updated"
	EventTypeToolStarted    EventType = "tool.started"
	EventTypeToolCompleted  EventType = "tool.completed"
	EventTypeDiffSummary    EventType = "diff.summary"
	EventTypeUsageUpdated   EventType = "usage.updated"
	EventTypeCustom         EventType = "custom"
)

// EventPayload is a marker interface implemented by all recognised payload structs.
type EventPayload interface {
	isEventPayload()
}

// Event captures a single emission from an agent session.
type Event struct {
	Type      EventType
	PromptID  string
	ThreadID  string
	Payload   EventPayload
	Usage     *TokenUsage
	Error     *EventError
	Message   string
	Timestamp time.Time
	Metadata  map[string]any
}

// TokenUsage mirrors token accounting emitted by providers.
type TokenUsage struct {
	InputTokens       int
	CachedInputTokens int
	OutputTokens      int
}

// EventError standardises error payloads from sessions.
type EventError struct {
	Message string
	Code    string
}

// AgentMessage represents a textual assistant response.
type AgentMessage struct {
	ID        string
	Role      PromptAuthor
	Text      string
	Reasoning string
	Metadata  map[string]any
}

func (*AgentMessage) isEventPayload() {}

// CommandRun captures CLI command execution status/output.
type CommandRun struct {
	ID       string
	Command  string
	Output   string
	ExitCode *int
	Status   string
	Metadata map[string]any
}

func (*CommandRun) isEventPayload() {}

// FileChange describes a single file status update emitted by the agent.
type FileChange struct {
	Path   string
	Kind   string
	Status string
}

// DiffChunk aggregates file diff summaries within a payload.
type DiffChunk struct {
	ID       string
	Changes  []FileChange
	Metadata map[string]any
}

func (*DiffChunk) isEventPayload() {}

// ToolCall represents an MCP or plugin invocation lifecycle.
type ToolCall struct {
	ID       string
	Server   string
	Tool     string
	Status   string
	Metadata map[string]any
}

func (*ToolCall) isEventPayload() {}

// WebSearch captures a query issued by the agent.
type WebSearch struct {
	ID    string
	Query string
}

func (*WebSearch) isEventPayload() {}

// TodoList summarises outstanding agent todos.
type TodoList struct {
	ID    string
	Items []TodoItem
}

func (*TodoList) isEventPayload() {}

// TodoItem represents a single todo entry.
type TodoItem struct {
	Text      string
	Completed bool
}

// ErrorItem conveys a non-fatal error surfaced during streaming.
type ErrorItem struct {
	ID      string
	Message string
}

func (*ErrorItem) isEventPayload() {}
