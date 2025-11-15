package agents

import (
	"encoding/json"
	"testing"

	"codex-ui/internal/agents/connector"
	"codex-ui/internal/storage/discovery"
)

func TestMessageRequestToPrompt(t *testing.T) {
	schema := json.RawMessage(`{"type":"object"}`)
	req := MessageRequest{
		AgentID:   "codex",
		ProjectID: 101,
		ThreadID:  202,
		Input:     "Please refactor",
		Segments: []InputSegmentDTO{
			{Type: "text", Text: "Additional context"},
			{Type: "image", ImagePath: "/tmp/image.png"},
		},
		ThreadExternalID: "thread-ext",
		ThreadOptions: ThreadOptionsDTO{
			Model:            "codex-pro",
			SandboxMode:      "isolated",
			WorkingDirectory: "/work",
			SkipGitRepoCheck: true,
		},
		TurnOptions: &TurnOptionsDTO{OutputSchema: schema},
	}
	prompt, err := MessageRequestToPrompt(req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(prompt.Segments) != 3 {
		t.Fatalf("expected 3 segments, got %d", len(prompt.Segments))
	}
	if prompt.Segments[0].Text != req.Input {
		t.Fatalf("expected first segment to use request input")
	}
	if prompt.Segments[1].Text != req.Segments[0].Text {
		t.Fatalf("expected legacy segment text to be preserved")
	}
	if prompt.Segments[2].Path != req.Segments[1].ImagePath {
		t.Fatalf("expected image path to map onto prompt segment")
	}
	if prompt.Metadata["agentId"].(string) != req.AgentID {
		t.Fatalf("metadata agentId mismatch")
	}
	if _, ok := prompt.Metadata["outputSchema"]; !ok {
		t.Fatalf("expected outputSchema to be forwarded in metadata")
	}
}

func TestSessionOptionsFromLegacy(t *testing.T) {
	thread := discovery.Thread{
		ID:           77,
		ProjectID:    55,
		WorktreePath: "/repo/thread",
		SandboxMode:  "default",
	}
	req := MessageRequest{
		ThreadID:         thread.ID,
		ThreadExternalID: "ext-id",
		ThreadOptions: ThreadOptionsDTO{
			WorkingDirectory: "/override",
			SandboxMode:      "strict",
			SkipGitRepoCheck: true,
		},
	}
	env := map[string]string{"FOO": "bar"}
	options := SessionOptionsFromLegacy(thread, req, env)
	if options.ProjectID != thread.ProjectID {
		t.Fatalf("expected project ID to match thread")
	}
	if options.WorkingDirectory != req.ThreadOptions.WorkingDirectory {
		t.Fatalf("expected working directory override to be applied")
	}
	if options.SandboxMode != req.ThreadOptions.SandboxMode {
		t.Fatalf("expected sandbox override to apply")
	}
	if !options.SkipGitRepoCheck {
		t.Fatalf("expected skip git repo check flag to propagate")
	}
	if options.Env["FOO"] != "bar" {
		t.Fatalf("expected env map to be copied")
	}
	env["FOO"] = "mutated"
	if options.Env["FOO"] != "bar" {
		t.Fatalf("expected env copy to be isolated from caller mutations")
	}
	if options.Metadata["threadExternalId"].(string) != req.ThreadExternalID {
		t.Fatalf("expected thread external id metadata")
	}
	skipMeta, ok := options.Metadata["skipGitRepoCheck"].(bool)
	if !ok || !skipMeta {
		t.Fatalf("expected skipGitRepoCheck metadata to be true")
	}
}

func TestStreamEventRoundTrip(t *testing.T) {
	code := 0
	legacy := StreamEvent{
		Type:     "item.completed",
		ThreadID: "thread-1",
		Message:  "done",
		Item: &AgentItemDTO{
			ID:   "item-1",
			Type: legacyItemTypeCommandExecution,
			Command: &CommandExecutionDTO{
				Command:          "ls",
				AggregatedOutput: "output",
				ExitCode:         &code,
				Status:           "succeeded",
			},
		},
		Usage: &UsageDTO{InputTokens: 1, CachedInputTokens: 2, OutputTokens: 3},
		Error: &StreamError{Message: "warning"},
	}
	converted := StreamEventToConnector(legacy)
	if converted.Type != connector.EventTypeItemCompleted {
		t.Fatalf("expected connector event type to map from legacy")
	}
	payload, ok := converted.Payload.(*connector.CommandRun)
	if !ok {
		t.Fatalf("expected payload to convert to CommandRun")
	}
	if payload.Command != legacy.Item.Command.Command || payload.Output != legacy.Item.Command.AggregatedOutput {
		t.Fatalf("command payload mismatch")
	}
	round := ConnectorEventToStream(converted)
	if round.Type != legacy.Type {
		t.Fatalf("expected round-trip type %s, got %s", legacy.Type, round.Type)
	}
	if round.Item == nil || round.Item.Command == nil {
		t.Fatalf("expected command payload after round trip")
	}
	if *round.Item.Command.ExitCode != *legacy.Item.Command.ExitCode {
		t.Fatalf("expected exit code to round-trip")
	}
	if round.Item.Type != legacy.Item.Type {
		t.Fatalf("expected item type %s, got %s", legacy.Item.Type, round.Item.Type)
	}
}

func TestConnectorPayloadToLegacyTypes(t *testing.T) {
	exitCode := 1
	cases := []struct {
		name     string
		payload  connector.EventPayload
		expected string
	}{
		{
			name:     "agent message",
			payload:  &connector.AgentMessage{ID: "a", Text: "hi"},
			expected: legacyItemTypeAgentMessage,
		},
		{
			name:     "command",
			payload:  &connector.CommandRun{ID: "c", Command: "ls", ExitCode: &exitCode, Status: "succeeded"},
			expected: legacyItemTypeCommandExecution,
		},
		{
			name:     "diff chunk",
			payload:  &connector.DiffChunk{ID: "d", Changes: []connector.FileChange{{Path: "main.go", Kind: "mod", Status: "updated"}}},
			expected: legacyItemTypeFileChange,
		},
		{
			name:     "tool call",
			payload:  &connector.ToolCall{ID: "tool", Server: "mcp", Tool: "fmt", Status: "running"},
			expected: legacyItemTypeMcpToolCall,
		},
		{
			name:     "web search",
			payload:  &connector.WebSearch{ID: "search", Query: "codex"},
			expected: legacyItemTypeWebSearch,
		},
		{
			name:     "todo list",
			payload:  &connector.TodoList{ID: "todo", Items: []connector.TodoItem{{Text: "one", Completed: true}}},
			expected: legacyItemTypeTodoList,
		},
		{
			name:     "error",
			payload:  &connector.ErrorItem{ID: "err", Message: "boom"},
			expected: legacyItemTypeError,
		},
	}
	for _, tc := range cases {
		item := connectorPayloadToLegacy(tc.payload)
		if item == nil {
			t.Fatalf("%s: expected item", tc.name)
		}
		if item.Type != tc.expected {
			t.Fatalf("%s: expected type %s, got %s", tc.name, tc.expected, item.Type)
		}
	}
}

func TestMapLegacyEventTypePassThrough(t *testing.T) {
	if got := mapLegacyEventType("usage.updated"); got != connector.EventTypeUsageUpdated {
		t.Fatalf("expected usage.updated constant, got %s", got)
	}
	custom := "agent.custom"
	if got := mapLegacyEventType(custom); string(got) != custom {
		t.Fatalf("expected custom type passthrough, got %s", got)
	}
	if legacy := mapConnectorEventType(connector.EventTypePlanUpdated); legacy != "plan.updated" {
		t.Fatalf("expected plan.updated string, got %s", legacy)
	}
}
