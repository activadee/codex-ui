package godexsdk

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/activadee/godex"

	"codex-ui/internal/agents/connector"
)

const defaultModel = "gpt-5"

var capabilityDefaults = connector.CapabilitySet{
	connector.CapabilitySupportsImages:        true,
	connector.CapabilitySupportsReasoning:     true,
	connector.CapabilitySupportsSandbox:       true,
	connector.CapabilityEmitsDiffs:            true,
	connector.CapabilitySupportsAttachments:   true,
	connector.CapabilitySupportsCustomSchemas: true,
}

// Adapter wraps the godex SDK and exposes connector semantics.
type Adapter struct {
	CodexPathOverride string
	BaseURL           string
	APIKey            string
	Model             string
	ConfigOverrides   map[string]any
}

// ID returns the logical identifier for this adapter.
func (a *Adapter) ID() string {
	return "codex"
}

// Capabilities advertises the supported feature set.
func (a *Adapter) Capabilities() connector.CapabilitySet {
	return capabilityDefaults.Clone()
}

// Info reports metadata for registry listing.
func (a *Adapter) Info(ctx context.Context) (string, string, connector.CapabilitySet, error) {
	return "Codex (godex SDK)", "unknown", a.Capabilities(), nil
}

// Start initialises a godex thread session.
func (a *Adapter) Start(ctx context.Context, opts connector.SessionOptions) (connector.Session, error) {
	client, err := godex.New(godex.CodexOptions{
		CodexPathOverride: a.CodexPathOverride,
		BaseURL:           a.BaseURL,
		APIKey:            a.APIKey,
		ConfigOverrides:   a.ConfigOverrides,
	})
	if err != nil {
		return nil, err
	}

	threadOpts := buildThreadOptions(opts, a.Model)
	threadID := threadIdentifier(opts)
	var thread *godex.Thread
	if threadID != "" {
		thread = client.ResumeThread(threadID, threadOpts)
	} else {
		thread = client.StartThread(threadOpts)
	}

	sess := &session{
		thread: thread,
		evts:   make(chan connector.Event, 256),
		caps:   a.Capabilities(),
	}
	sess.setThreadID(thread.ID())
	return sess, nil
}

func buildThreadOptions(opts connector.SessionOptions, adapterModel string) godex.ThreadOptions {
	model := selectModel(opts, adapterModel)
	workingDir := strings.TrimSpace(opts.WorkingDirectory)
	if workingDir == "" {
		workingDir = strings.TrimSpace(opts.Thread.WorktreePath)
	}
	return godex.ThreadOptions{
		Model:            model,
		SandboxMode:      parseSandboxMode(opts.SandboxMode),
		WorkingDirectory: workingDir,
		SkipGitRepoCheck: opts.SkipGitRepoCheck,
	}
}

func selectModel(opts connector.SessionOptions, adapterModel string) string {
	if val := metadataString(opts.Metadata, "model"); val != "" {
		return val
	}
	if strings.TrimSpace(opts.Thread.Model) != "" {
		return strings.TrimSpace(opts.Thread.Model)
	}
	if strings.TrimSpace(adapterModel) != "" {
		return strings.TrimSpace(adapterModel)
	}
	return defaultModel
}

func parseSandboxMode(value string) godex.SandboxMode {
	normalized := strings.TrimSpace(strings.ToLower(value))
	switch normalized {
	case strings.ToLower(string(godex.SandboxModeReadOnly)):
		return godex.SandboxModeReadOnly
	case strings.ToLower(string(godex.SandboxModeDangerFullAccess)):
		return godex.SandboxModeDangerFullAccess
	case strings.ToLower(string(godex.SandboxModeWorkspaceWrite)):
		return godex.SandboxModeWorkspaceWrite
	default:
		return godex.SandboxModeWorkspaceWrite
	}
}

func threadIdentifier(opts connector.SessionOptions) string {
	if id := strings.TrimSpace(opts.Thread.ExternalID); id != "" {
		return id
	}
	return metadataString(opts.Metadata, "threadExternalId")
}

func buildTurnOptions(prompts []connector.Prompt) (*godex.TurnOptions, error) {
	schemaRaw := findSchema(prompts)
	if len(schemaRaw) == 0 {
		return nil, nil
	}
	var schema any
	if err := json.Unmarshal(schemaRaw, &schema); err != nil {
		return nil, fmt.Errorf("decode output schema: %w", err)
	}
	return &godex.TurnOptions{OutputSchema: schema}, nil
}
