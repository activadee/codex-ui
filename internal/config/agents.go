package config

import (
	"os"

	"gopkg.in/yaml.v3"

	"codex-ui/internal/agents/registry"
)

// AgentsFile mirrors the on-disk agents.yaml schema.
type AgentsFile struct {
	Agents []registry.Entry `yaml:"agents"`
}

// LoadAgents reads agents.yaml from disk and builds a registry.
func LoadAgents(path string) (*registry.Registry, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return registry.New(nil), nil
	}
	var cfg AgentsFile
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	return registry.New(cfg.Agents), nil
}
