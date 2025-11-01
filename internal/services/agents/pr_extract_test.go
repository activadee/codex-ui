package agents

import "testing"

func TestExtractPRURLFromEvent_Marker(t *testing.T) {
    evt := StreamEvent{
        Item: &AgentItemDTO{Text: "Done.\nPR_URL: https://github.com/acme/repo/pull/123"},
    }
    got := ExtractPRURLFromEvent(evt)
    want := "https://github.com/acme/repo/pull/123"
    if got != want {
        t.Fatalf("expected %s, got %s", want, got)
    }
}

func TestExtractPRURLFromEvent_CommandOutput(t *testing.T) {
    evt := StreamEvent{
        Item: &AgentItemDTO{Command: &CommandExecutionDTO{AggregatedOutput: "Creating pull request...\nhttps://github.com/acme/repo/pull/456"}},
    }
    got := ExtractPRURLFromEvent(evt)
    want := "https://github.com/acme/repo/pull/456"
    if got != want {
        t.Fatalf("expected %s, got %s", want, got)
    }
}

func TestExtractPRURLFromEvent_MessageFallback(t *testing.T) {
    evt := StreamEvent{Message: "PR created: https://github.com/acme/repo/pull/789"}
    got := ExtractPRURLFromEvent(evt)
    want := "https://github.com/acme/repo/pull/789"
    if got != want {
        t.Fatalf("expected %s, got %s", want, got)
    }
}

func TestExtractPRURLFromEvent_None(t *testing.T) {
    evt := StreamEvent{Item: &AgentItemDTO{Text: "No url here"}}
    got := ExtractPRURLFromEvent(evt)
    if got != "" {
        t.Fatalf("expected empty string, got %s", got)
    }
}

