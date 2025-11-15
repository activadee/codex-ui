package connector

import (
	"context"
	"io"
	"time"
)

// Role identifies the author of a prompt segment stream.
type Role string

const (
	RoleUser   Role = "user"
	RoleSystem Role = "system"
	RoleTool   Role = "tool"
)

// ContentBlock describes a single chunk of prompt content.
type ContentBlock struct {
	Kind     string `json:"kind"`
	Text     string `json:"text,omitempty"`
	Path     string `json:"path,omitempty"`
	Language string `json:"language,omitempty"`
	Mime     string `json:"mime,omitempty"`
}

// Prompt represents a message sent to an agent session.
type Prompt struct {
	Role        Role           `json:"role"`
	Blocks      []ContentBlock `json:"blocks"`
	Temperature *float32       `json:"temperature,omitempty"`
	MaxTokens   *int           `json:"maxTokens,omitempty"`
	Tags        []string       `json:"tags,omitempty"`
}

// EventKind enumerates supported streaming payloads.
type EventKind string

const (
	EventTextChunk       EventKind = "text_chunk"
	EventToolCall        EventKind = "tool_call"
	EventPlanUpdate      EventKind = "plan_update"
	EventFileEditSuggest EventKind = "file_edit_suggest"
	EventImage           EventKind = "image"
	EventExit            EventKind = "exit"
	EventError           EventKind = "error"
)

// Event reports a streaming payload coming from an agent session.
type Event struct {
	Kind        EventKind      `json:"kind"`
	At          time.Time      `json:"at"`
	Text        string         `json:"text,omitempty"`
	Plan        string         `json:"plan,omitempty"`
	ToolName    string         `json:"toolName,omitempty"`
	ToolArgs    any            `json:"toolArgs,omitempty"`
	FilePath    string         `json:"filePath,omitempty"`
	DiffUnified string         `json:"diffUnified,omitempty"`
	ImagePath   string         `json:"imagePath,omitempty"`
	Code        int            `json:"code,omitempty"`
	Err         string         `json:"err,omitempty"`
	Meta        map[string]any `json:"meta,omitempty"`
}

// Capabilities advertises supported features for an adapter/session.
type Capabilities map[string]bool

// SessionOptions configure a session.
type SessionOptions struct {
	WorkspaceRoot string
	Env           map[string]string
	Metadata      map[string]any
}

// Session represents a live CLI or SDK backed interaction.
type Session interface {
	ID() string
	Capabilities() Capabilities
	Send(ctx context.Context, prompts ...Prompt) error
	Events() <-chan Event
	Stdin() io.WriteCloser
	Close() error
}

// Adapter exposes metadata and session creation for an agent implementation.
type Adapter interface {
	Info(ctx context.Context) (name, version string, caps Capabilities, err error)
	Start(ctx context.Context, opts SessionOptions) (Session, error)
}
