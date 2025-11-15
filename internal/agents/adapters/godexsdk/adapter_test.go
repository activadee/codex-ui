package godexsdk

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/activadee/godex"

	"codex-ui/internal/agents/connector"
	"codex-ui/internal/storage/discovery"
)

func TestBuildThreadOptionsPrefersMetadataModel(t *testing.T) {
	opts := connector.SessionOptions{
		Thread: discovery.Thread{
			Model:        "gpt-thread",
			WorktreePath: "/tmp/worktree",
		},
		SandboxMode: "danger-full-access",
		Metadata: map[string]any{
			"model": "gpt-meta",
		},
		SkipGitRepoCheck: true,
	}

	threadOpts := buildThreadOptions(opts, "")
	if threadOpts.Model != "gpt-meta" {
		t.Fatalf("expected metadata model to win, got %q", threadOpts.Model)
	}
	if threadOpts.SandboxMode != godex.SandboxModeDangerFullAccess {
		t.Fatalf("expected sandbox mode danger-full-access, got %q", threadOpts.SandboxMode)
	}
	if threadOpts.WorkingDirectory != "/tmp/worktree" {
		t.Fatalf("expected working directory fallback, got %q", threadOpts.WorkingDirectory)
	}
	if !threadOpts.SkipGitRepoCheck {
		t.Fatalf("expected skip git repo check to propagate")
	}
}

func TestBuildTurnOptionsDecodesSchema(t *testing.T) {
	schema := json.RawMessage(`{"type":"object"}`)
	turn, err := buildTurnOptions([]connector.Prompt{{Metadata: map[string]any{"outputSchema": schema}}})
	if err != nil {
		t.Fatalf("buildTurnOptions returned error: %v", err)
	}
	if turn == nil || turn.OutputSchema == nil {
		t.Fatalf("expected output schema to be parsed")
	}
}

func TestPromptsToInputsPrefersSegments(t *testing.T) {
	prompts := []connector.Prompt{{
		Segments: []connector.PromptSegment{
			{Kind: connector.SegmentKindText, Text: "hello"},
			{Kind: connector.SegmentKindCode, Text: "fmt.Println(\"hi\")", Lang: "go"},
		},
	}}
	segments, fallback := promptsToInputs(prompts)
	if fallback != "" {
		t.Fatalf("expected empty fallback, got %q", fallback)
	}
	if len(segments) != 2 {
		t.Fatalf("expected two segments, got %d", len(segments))
	}
	if segments[1].Text == "" || !strings.Contains(segments[1].Text, "```go") {
		t.Fatalf("expected code block formatting, got %q", segments[1].Text)
	}
}

func TestConvertThreadEventItemPayload(t *testing.T) {
	event := godex.ItemCompletedEvent{
		Type: godex.ThreadEventTypeItemCompleted,
		Item: godex.AgentMessageItem{ID: "msg", Text: "hi"},
	}
	converted := convertThreadEvent(event, "thread-1")
	if converted.Type != connector.EventTypeItemCompleted {
		t.Fatalf("expected item.completed mapping, got %s", converted.Type)
	}
	if converted.ThreadID != "thread-1" {
		t.Fatalf("expected thread id to propagate, got %q", converted.ThreadID)
	}
	msg, ok := converted.Payload.(*connector.AgentMessage)
	if !ok {
		t.Fatalf("expected agent message payload, got %T", converted.Payload)
	}
	if msg.Text != "hi" || msg.ID != "msg" {
		t.Fatalf("agent message payload mismatch: %+v", msg)
	}
}
