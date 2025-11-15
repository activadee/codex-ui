package config

import (
	"os"
	"sort"

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
		if os.IsNotExist(err) {
			return registry.New(nil), nil
		}
		return nil, err
	}
	var cfg AgentsFile
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, err
	}
	for idx := range cfg.Agents {
		cfg.Agents[idx].Env = expandEnv(cfg.Agents[idx].Env)
	}
	sort.SliceStable(cfg.Agents, func(i, j int) bool { return cfg.Agents[i].ID < cfg.Agents[j].ID })
	return registry.New(cfg.Agents), nil
}

func expandEnv(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	expanded := make(map[string]string, len(values))
	for key, value := range values {
		expanded[key] = os.ExpandEnv(value)
	}
	return expanded
}
