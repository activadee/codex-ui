package agents

import (
	"context"
	"testing"
	"time"

	"github.com/activadee/godex"
)

func TestCodexAdapter_Stream_TextInput(t *testing.T) {
	eventsCh := make(chan godex.ThreadEvent, 3)
	eventsCh <- godex.ThreadStartedEvent{Type: godex.ThreadEventTypeThreadStarted, ThreadID: "thread-123"}
	eventsCh <- godex.ItemCompletedEvent{Type: godex.ThreadEventTypeItemCompleted, Item: godex.AgentMessageItem{ID: "item-1", Type: string(godex.ThreadItemTypeAgentMessage), Text: "hello"}}
	eventsCh <- godex.TurnCompletedEvent{Type: godex.ThreadEventTypeTurnCompleted, Usage: godex.Usage{InputTokens: 5, OutputTokens: 7}}
	close(eventsCh)

	fakeStream := &fakeStreamResult{events: eventsCh}
	fakeThread := &fakeThreadRunner{stream: fakeStream}
	fakeClient := &fakeCodexClient{startThread: fakeThread}

	adapter := &CodexAdapter{client: fakeClient}

	req := MessageRequest{
		Input: "summarise",
		ThreadOptions: ThreadOptionsDTO{
			Model: "gpt-5.1-codex",
		},
	}

	result, err := adapter.Stream(context.Background(), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var events []StreamEvent
	for evt := range result.Events {
		events = append(events, evt)
	}

	if len(events) != 3 {
		t.Fatalf("expected 3 events, got %d", len(events))
	}

	if events[0].ThreadID != "thread-123" {
		t.Fatalf("expected thread id, got %q", events[0].ThreadID)
	}

	if events[1].Item == nil || events[1].Item.Text != "hello" {
		t.Fatalf("expected agent message item, got %+v", events[1].Item)
	}

	if events[2].Usage == nil || events[2].Usage.OutputTokens != 7 {
		t.Fatalf("expected usage payload, got %+v", events[2].Usage)
	}

	select {
	case err := <-result.Done:
		if err != nil {
			t.Fatalf("unexpected done error: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for done channel")
	}

	if !fakeThread.calledRunStreamed {
		t.Fatal("expected RunStreamed to be invoked")
	}
}

func TestCodexAdapter_Stream_SegmentsValidation(t *testing.T) {
	adapter := &CodexAdapter{client: &fakeCodexClient{startThread: &fakeThreadRunner{stream: &fakeStreamResult{events: make(chan godex.ThreadEvent)}}}}

	req := MessageRequest{
		Segments: []InputSegmentDTO{{Type: "text"}},
		ThreadOptions: ThreadOptionsDTO{
			Model: "gpt-5.1-codex",
		},
	}

	_, err := adapter.Stream(context.Background(), req)
	if err == nil {
		t.Fatal("expected error for empty text segment")
	}
}

func TestCodexAdapter_Stream_ModelRequired(t *testing.T) {
	adapter := &CodexAdapter{client: &fakeCodexClient{startThread: &fakeThreadRunner{stream: &fakeStreamResult{events: make(chan godex.ThreadEvent)}}}}

	req := MessageRequest{Input: "hi"}

	_, err := adapter.Stream(context.Background(), req)
	if err == nil || err.Error() != "threadOptions.model is required" {
		t.Fatalf("expected model required error, got %v", err)
	}
}

// --- fakes ---

type fakeCodexClient struct {
	startThread  *fakeThreadRunner
	resumeThread *fakeThreadRunner
}

func (f *fakeCodexClient) StartThread(options godex.ThreadOptions) threadRunner {
	if f.startThread != nil {
		f.startThread.lastThreadOptions = options
		return f.startThread
	}
	return &fakeThreadRunner{stream: &fakeStreamResult{events: make(chan godex.ThreadEvent)}}
}

func (f *fakeCodexClient) ResumeThread(id string, options godex.ThreadOptions) threadRunner {
	if f.resumeThread != nil {
		f.resumeThread.resumedWithID = id
		f.resumeThread.lastThreadOptions = options
		return f.resumeThread
	}
	return &fakeThreadRunner{stream: &fakeStreamResult{events: make(chan godex.ThreadEvent)}}
}

type fakeThreadRunner struct {
	stream            streamResult
	calledRunStreamed bool
	calledRunInputs   bool
	lastInput         string
	lastSegments      []godex.InputSegment
	resumedWithID     string
	lastThreadOptions godex.ThreadOptions
}

func (f *fakeThreadRunner) ID() string { return "thread-123" }

func (f *fakeThreadRunner) RunStreamed(ctx context.Context, input string, turnOptions *godex.TurnOptions) (streamResult, error) {
	f.calledRunStreamed = true
	f.lastInput = input
	return f.stream, nil
}

func (f *fakeThreadRunner) RunStreamedInputs(ctx context.Context, segments []godex.InputSegment, turnOptions *godex.TurnOptions) (streamResult, error) {
	f.calledRunInputs = true
	f.lastSegments = segments
	return f.stream, nil
}

type fakeStreamResult struct {
	events   <-chan godex.ThreadEvent
	waitErr  error
	closeErr error
}

func (f *fakeStreamResult) Events() <-chan godex.ThreadEvent { return f.events }

func (f *fakeStreamResult) Wait() error { return f.waitErr }

func (f *fakeStreamResult) Close() error { return f.closeErr }
