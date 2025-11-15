package registry

import (
	"context"
	"fmt"
	"sort"

	ccli "codex-ui/internal/agents/adapters/cli"
	cgdx "codex-ui/internal/agents/adapters/godexsdk"
	"codex-ui/internal/agents/connector"
)

// Entry represents a single agent configuration sourced from YAML.
type Entry struct {
	ID      string            `yaml:"id"`
	Name    string            `yaml:"name"`
	Backend string            `yaml:"backend"`
	Cmd     string            `yaml:"cmd,omitempty"`
	Args    []string          `yaml:"args,omitempty"`
	Env     map[string]string `yaml:"env,omitempty"`
	Model   string            `yaml:"model,omitempty"`
}

// Registry stores agent entries keyed by ID.
type Registry struct {
	entries map[string]Entry
}

// New builds a registry from the provided entries.
func New(entries []Entry) *Registry {
	mapped := make(map[string]Entry, len(entries))
	for _, entry := range entries {
		if entry.ID == "" {
			continue
		}
		mapped[entry.ID] = entry
	}
	return &Registry{entries: mapped}
}

// Start initialises a session for the requested agent identifier.
func (r *Registry) Start(ctx context.Context, id string, opts connector.SessionOptions) (connector.Session, error) {
	if r == nil {
		return nil, fmt.Errorf("registry not initialised")
	}
	entry, ok := r.entries[id]
	if !ok {
		return nil, fmt.Errorf("unknown agent: %s", id)
	}
	switch entry.Backend {
	case "cli":
		adapter := &ccli.Adapter{Cmd: entry.Cmd, Args: entry.Args, Env: entry.Env}
		return adapter.Start(ctx, opts)
	case "godex":
		adapter := &cgdx.Adapter{Model: entry.Model}
		return adapter.Start(ctx, opts)
	default:
		return nil, fmt.Errorf("unsupported backend: %s", entry.Backend)
	}
}

// Info returns metadata describing registered agents.
func (r *Registry) Info(ctx context.Context) ([]map[string]any, error) {
	if r == nil {
		return nil, fmt.Errorf("registry not initialised")
	}
	keys := make([]string, 0, len(r.entries))
	for id := range r.entries {
		keys = append(keys, id)
	}
	sort.Strings(keys)
	infos := make([]map[string]any, 0, len(keys))
	for _, id := range keys {
		entry := r.entries[id]
		infos = append(infos, map[string]any{
			"id":      entry.ID,
			"name":    entry.Name,
			"backend": entry.Backend,
		})
	}
	return infos, nil
}
