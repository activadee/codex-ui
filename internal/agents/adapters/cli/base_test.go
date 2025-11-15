package cli

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"codex-ui/internal/agents/connector"
)

func TestAdapterStartAndStream(t *testing.T) {
	adapter := &Adapter{
		Cmd:  os.Args[0],
		Args: []string{"-test.run=TestHelperProcess", "--", "cli-agent"},
		Env: map[string]string{
			"CLI_TEST_VAR":           "from-adapter",
			"GO_WANT_HELPER_PROCESS": "1",
		},
	}
	sess, err := adapter.Start(context.Background(), connector.SessionOptions{Env: map[string]string{"CLI_TEST_ENV": "from-session"}})
	if err != nil {
		t.Fatalf("start session: %v", err)
	}
	t.Cleanup(func() { _ = sess.Close() })

	prompt := connector.Prompt{
		Author:   connector.PromptAuthorUser,
		Segments: []connector.PromptSegment{{Kind: connector.SegmentKindText, Text: "hello"}},
	}
	if err := sess.Send(context.Background(), prompt); err != nil {
		t.Fatalf("send prompt: %v", err)
	}

	deadline := time.After(2 * time.Second)
	var seen []connector.Event
	for {
		select {
		case evt, ok := <-sess.Events():
			if !ok {
				goto done
			}
			seen = append(seen, evt)
			if strings.Contains(evt.Message, "cli exited") {
				goto done
			}
		case <-deadline:
			t.Fatalf("timed out waiting for events")
		}
	}

done:
	if len(seen) < 3 {
		b, _ := json.Marshal(seen)
		t.Fatalf("unexpected events: %s", string(b))
	}
	foundEnv := false
	foundStdout := false
	foundStderr := false
	for _, evt := range seen {
		if evt.Type == connector.EventTypeItemUpdated && strings.Contains(evt.Message, "CLI_TEST_VAR=from-adapter") {
			foundEnv = true
		}
		if evt.Type == connector.EventTypeItemUpdated && evt.Message == "stdout-line" {
			foundStdout = true
		}
		if evt.Type == connector.EventTypeSessionError && evt.Message == "stderr-line" {
			foundStderr = true
		}
	}
	if !foundEnv {
		t.Fatalf("env chunk missing: %#v", seen)
	}
	if !foundStdout {
		t.Fatalf("stdout line missing: %#v", seen)
	}
	if !foundStderr {
		t.Fatalf("stderr line missing: %#v", seen)
	}
	if exit := seen[len(seen)-1]; !strings.Contains(exit.Message, "cli exited") {
		t.Fatalf("unexpected exit event: %#v", exit)
	}
}

func TestParseCLIEventSupportsTypeKey(t *testing.T) {
	line := `{"type":"plan_update","plan":"step"}`
	evt, ok := parseCLIEvent(line)
	if !ok {
		t.Fatalf("event should parse")
	}
	if evt.Type != connector.EventTypePlanUpdated {
		t.Fatalf("unexpected type %s", evt.Type)
	}
	if evt.Message != "step" {
		t.Fatalf("unexpected payload %#v", evt)
	}
}

func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}
	args := os.Args
	idx := -1
	for i, arg := range args {
		if arg == "--" {
			idx = i
			break
		}
	}
	if idx >= 0 {
		args = args[idx+1:]
	}
	if len(args) == 0 {
		os.Exit(2)
	}
	switch args[0] {
	case "cli-agent":
		runCLIAgentHelper()
	default:
		os.Exit(2)
	}
}

func runCLIAgentHelper() {
	scanner := bufio.NewScanner(os.Stdin)
	if scanner.Scan() {
		var payload struct {
			Type    string
			Prompts []connector.Prompt
		}
		_ = json.Unmarshal(scanner.Bytes(), &payload)
	}
	envSummary := os.Getenv("CLI_TEST_VAR") + "," + os.Getenv("CLI_TEST_ENV")
	fmt.Fprintf(os.Stdout, "{\"kind\":\"text_chunk\",\"text\":\"CLI_TEST_VAR=%s\"}\n", envSummary)
	fmt.Fprintln(os.Stdout, "stdout-line")
	fmt.Fprintln(os.Stderr, "stderr-line")
	os.Exit(0)
}
