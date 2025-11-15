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
}

func TestStreamEventRoundTrip(t *testing.T) {
	code := 0
	legacy := StreamEvent{
		Type:     "item.completed",
		ThreadID: "thread-1",
		Message:  "done",
		Item: &AgentItemDTO{
			ID:   "item-1",
			Type: "command",
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
}
