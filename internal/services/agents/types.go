package agents

import (
	"encoding/json"
)

// MessageRequest represents a request coming from the frontend to send a new turn
// to an agent.
type MessageRequest struct {
	AgentID          string            `json:"agentId,omitempty"`
	ProjectID        int64             `json:"projectId,omitempty"`
	ThreadID         int64             `json:"threadId,omitempty"`
	ThreadExternalID string            `json:"threadExternalId,omitempty"`
	Input            string            `json:"input,omitempty"`
	Segments         []InputSegmentDTO `json:"segments,omitempty"`
	ThreadOptions    ThreadOptionsDTO  `json:"threadOptions"`
	TurnOptions      *TurnOptionsDTO   `json:"turnOptions,omitempty"`
}

// InputSegmentDTO represents a piece of user input. Either Text or ImagePath must be set.
type InputSegmentDTO struct {
	Type      string `json:"type"`
	Text      string `json:"text,omitempty"`
	ImagePath string `json:"imagePath,omitempty"`
}

// ThreadOptionsDTO mirrors the options that configure a Codex thread.
type ThreadOptionsDTO struct {
	Model            string `json:"model"`
	SandboxMode      string `json:"sandboxMode,omitempty"`
	WorkingDirectory string `json:"workingDirectory,omitempty"`
	SkipGitRepoCheck bool   `json:"skipGitRepoCheck,omitempty"`
	ReasoningLevel   string `json:"reasoningLevel,omitempty"`
}

// TurnOptionsDTO holds options for a single agent turn.
type TurnOptionsDTO struct {
	OutputSchema json.RawMessage `json:"outputSchema,omitempty"`
}

// StreamEvent represents a single event emitted during a streamed turn.
type StreamEvent struct {
	Type     string        `json:"type"`
	ThreadID string        `json:"threadId,omitempty"`
	Item     *AgentItemDTO `json:"item,omitempty"`
	Usage    *UsageDTO     `json:"usage,omitempty"`
	Error    *StreamError  `json:"error,omitempty"`
	Message  string        `json:"message,omitempty"`
}

// AgentItemDTO is a normalised view of Codex thread items.
type AgentItemDTO struct {
	ID        string               `json:"id"`
	Type      string               `json:"type"`
	Text      string               `json:"text,omitempty"`
	Reasoning string               `json:"reasoning,omitempty"`
	Command   *CommandExecutionDTO `json:"command,omitempty"`
	FileDiffs []FileChangeDTO      `json:"fileDiffs,omitempty"`
	ToolCall  *ToolCallDTO         `json:"toolCall,omitempty"`
	WebSearch *WebSearchDTO        `json:"webSearch,omitempty"`
	TodoList  *TodoListDTO         `json:"todoList,omitempty"`
	Error     *ErrorItemDTO        `json:"error,omitempty"`
}

// CommandExecutionDTO captures command execution progress.
type CommandExecutionDTO struct {
	Command          string `json:"command"`
	AggregatedOutput string `json:"aggregatedOutput"`
	ExitCode         *int   `json:"exitCode,omitempty"`
	Status           string `json:"status"`
}

// FileChangeDTO describes a single file patch entry.
type FileChangeDTO struct {
	Path   string `json:"path"`
	Kind   string `json:"kind"`
	Status string `json:"status"`
}

// FileDiffStatDTO summarises total additions/removals for a tracked file.
type FileDiffStatDTO struct {
	Path    string `json:"path"`
	Added   int    `json:"added"`
	Removed int    `json:"removed"`
	Status  string `json:"status,omitempty"`
}

// ToolCallDTO summarises an MCP tool invocation.
type ToolCallDTO struct {
	Server string `json:"server"`
	Tool   string `json:"tool"`
	Status string `json:"status"`
}

// WebSearchDTO represents a web search event.
type WebSearchDTO struct {
	Query string `json:"query"`
}

// TodoListDTO captures the agent todo list state.
type TodoListDTO struct {
	Items []TodoItemDTO `json:"items"`
}

// TodoItemDTO represents a single todo entry.
type TodoItemDTO struct {
	Text      string `json:"text"`
	Completed bool   `json:"completed"`
}

// ErrorItemDTO surfaces non fatal errors.
type ErrorItemDTO struct {
	Message string `json:"message"`
}

// UsageDTO mirrors token usage stats.
type UsageDTO struct {
	InputTokens       int `json:"inputTokens"`
	CachedInputTokens int `json:"cachedInputTokens"`
	OutputTokens      int `json:"outputTokens"`
}

// StreamError wraps stream-level errors.
type StreamError struct {
	Message string `json:"message"`
}

// StreamHandle represents the initial response after starting a stream.
type StreamHandle struct {
	StreamID         string `json:"streamId"`
	ThreadID         int64  `json:"threadId"`
	ThreadExternalID string `json:"threadExternalId,omitempty"`
}

// ConversationEntryDTO mirrors a single transcript entry used by the frontend timeline.
type ConversationEntryDTO struct {
	ID        string            `json:"id"`
	Role      string            `json:"role"`
	CreatedAt string            `json:"createdAt"`
	UpdatedAt *string           `json:"updatedAt,omitempty"`
	Text      string            `json:"text,omitempty"`
	Segments  []InputSegmentDTO `json:"segments,omitempty"`
	Item      *AgentItemDTO     `json:"item,omitempty"`
	Tone      string            `json:"tone,omitempty"`
	Message   string            `json:"message,omitempty"`
	Meta      map[string]any    `json:"meta,omitempty"`
}

// ThreadDTO mirrors persisted thread data for the frontend.
type ThreadDTO struct {
	ID             int64   `json:"id"`
	ProjectID      int64   `json:"projectId"`
	ExternalID     string  `json:"externalId,omitempty"`
	WorktreePath   string  `json:"worktreePath,omitempty"`
	Title          string  `json:"title"`
	Model          string  `json:"model"`
	SandboxMode    string  `json:"sandboxMode"`
	ReasoningLevel string  `json:"reasoningLevel"`
	Status         string  `json:"status"`
	CreatedAt      string  `json:"createdAt"`
	UpdatedAt      string  `json:"updatedAt"`
	LastMessageAt  *string `json:"lastMessageAt,omitempty"`
}

// CancelResponse reports the updated status after stopping a stream.
type CancelResponse struct {
	ThreadID int64  `json:"threadId"`
	Status   string `json:"status"`
}
