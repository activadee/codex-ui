package agents

import (
	"context"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

    "codex-ui/internal/storage/discovery"
)

type streamPersistence struct {
	repo   *discovery.Repository
	thread discovery.Thread

	mu                      sync.Mutex
	agentItemsLoaded        bool
	existingAgentItemIDs    map[string]struct{}
	externalID              string
	finalStatus             discovery.ThreadStatus
	lastActivity            *time.Time
	finalAgentText          string
	reasoningSlices         []string
	usage                   *UsageDTO
	finalError              string
	agentMessagePersisted   bool
	agentReasoningPersisted bool
	finalised               bool
}

func newStreamPersistence(repo *discovery.Repository, thread discovery.Thread) *streamPersistence {
	return &streamPersistence{
		repo:   repo,
		thread: thread,
	}
}

func (s *streamPersistence) recordThreadExternal(ctx context.Context, externalID string) error {
	if externalID == "" {
		return nil
	}
	s.mu.Lock()
	alreadySet := s.thread.ExternalID != ""
	s.mu.Unlock()
	if alreadySet {
		return nil
	}
	if err := s.repo.UpdateThreadExternalID(ctx, s.thread.ID, externalID); err != nil {
		return err
	}
	updated, err := s.repo.GetThread(ctx, s.thread.ID)
	if err != nil {
		return err
	}
	s.mu.Lock()
	s.thread = updated
	s.mu.Unlock()
	return nil
}

func (s *streamPersistence) storeAgentItem(ctx context.Context, item *AgentItemDTO) *time.Time {
	if item == nil {
		return nil
	}
	id := strings.TrimSpace(item.ID)
	if id != "" && s.hasPersistedAgentItem(ctx, id) {
		return nil
	}
	payload, err := marshalAgentItemPayload(item)
	if err != nil {
		return nil
	}
	now := time.Now().UTC()
	if _, err := s.repo.CreateConversationEntry(ctx, discovery.CreateConversationEntryParams{
		ThreadID:  s.thread.ID,
		Role:      "agent",
		EntryType: item.Type,
		Payload:   payload,
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		return nil
	}
	s.mu.Lock()
	s.lastActivity = &now
	switch item.Type {
	case entryTypeAgentMessage:
		s.agentMessagePersisted = true
		if strings.TrimSpace(item.Text) != "" {
			s.finalAgentText = item.Text
		}
	case entryTypeAgentReasoning, "reasoning":
		s.agentReasoningPersisted = true
		if strings.TrimSpace(item.Reasoning) != "" {
			s.reasoningSlices = append(s.reasoningSlices, item.Reasoning)
		}
	default:
		if strings.TrimSpace(item.Text) != "" {
			s.finalAgentText = item.Text
		}
		if strings.TrimSpace(item.Reasoning) != "" {
			s.reasoningSlices = append(s.reasoningSlices, item.Reasoning)
		}
	}
	s.mu.Unlock()
	return &now
}

func (s *streamPersistence) hasPersistedAgentItem(ctx context.Context, id string) bool {
	s.ensureExistingAgentItems(ctx)
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.existingAgentItemIDs) == 0 {
		return false
	}
	_, ok := s.existingAgentItemIDs[id]
	return ok
}

func (s *streamPersistence) ensureExistingAgentItems(ctx context.Context) {
	s.mu.Lock()
	if s.agentItemsLoaded {
		s.mu.Unlock()
		return
	}
	s.mu.Unlock()

	entries, err := s.repo.ListConversationEntries(ctx, s.thread.ID)
	cache := make(map[string]struct{})
	if err == nil {
		for _, entry := range entries {
			if entry.Role != "agent" || len(entry.Payload) == 0 {
				continue
			}
			var payload AgentItemDTO
			if uerr := json.Unmarshal(entry.Payload, &payload); uerr != nil {
				continue
			}
			if trimmed := strings.TrimSpace(payload.ID); trimmed != "" {
				cache[trimmed] = struct{}{}
			}
		}
	}

	s.mu.Lock()
	if err == nil {
		s.existingAgentItemIDs = cache
	} else if s.existingAgentItemIDs == nil {
		s.existingAgentItemIDs = make(map[string]struct{})
	}
	s.agentItemsLoaded = true
	s.mu.Unlock()
}

func (s *streamPersistence) recordStatus(status discovery.ThreadStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.finalStatus = status
}

func (s *streamPersistence) recordUsage(usage *UsageDTO) {
	if usage == nil {
		return
	}
	s.mu.Lock()
	clone := *usage
	s.usage = &clone
	s.mu.Unlock()
}

func (s *streamPersistence) recordError(message string) {
	if strings.TrimSpace(message) == "" {
		return
	}
	s.mu.Lock()
	s.finalError = message
	s.mu.Unlock()
}

func (s *streamPersistence) finalize(ctx context.Context, status discovery.ThreadStatus) (discovery.Thread, error) {
	s.mu.Lock()
	if s.finalised {
		thread := s.thread
		s.mu.Unlock()
		return thread, nil
	}
	s.finalised = true
	if status == "" {
		status = s.finalStatus
	}
	if status == "" {
		status = discovery.ThreadStatusCompleted
	}
	thread := s.thread
	lastActivity := s.lastActivity
	finalText := s.finalAgentText
	reasoning := append([]string(nil), s.reasoningSlices...)
	usage := s.usage
	finalError := s.finalError
	agentMessagePersisted := s.agentMessagePersisted
	agentReasoningPersisted := s.agentReasoningPersisted
	s.mu.Unlock()

	hasLatest := false
	var latest time.Time

	if strings.TrimSpace(finalText) != "" && !agentMessagePersisted {
		if created := s.storeAgentItem(ctx, &AgentItemDTO{Type: entryTypeAgentMessage, Text: finalText}); created != nil {
			if !hasLatest || created.After(latest) {
				hasLatest = true
				latest = *created
			}
		}
	}

	if len(reasoning) > 0 && !agentReasoningPersisted {
		item := &AgentItemDTO{Type: "reasoning", Reasoning: strings.Join(reasoning, "\n")}
		if created := s.storeAgentItem(ctx, item); created != nil {
			if !hasLatest || created.After(latest) {
				hasLatest = true
				latest = *created
			}
		}
	}

	if usage != nil {
		message, meta := buildUsageSystemMessage(usage)
		if strings.TrimSpace(message) != "" {
			if created := s.createSystemEntry(ctx, "info", message, meta); created != nil {
				if !hasLatest || created.After(latest) {
					hasLatest = true
					latest = *created
				}
			}
		}
	}

	if strings.TrimSpace(finalError) != "" {
		if created := s.createSystemEntry(ctx, "error", finalError, nil); created != nil {
			if !hasLatest || created.After(latest) {
				hasLatest = true
				latest = *created
			}
		}
	}

	var lastMessageAt *time.Time
	if hasLatest {
		lastMessageAt = &latest
	} else if lastActivity != nil {
		lastMessageAt = lastActivity
	} else {
		now := time.Now().UTC()
		lastMessageAt = &now
	}

    if err := s.repo.UpdateThreadStatus(ctx, thread.ID, status, lastMessageAt); err != nil {
        return thread, err
    }
    updated, err := s.repo.GetThread(ctx, thread.ID)
    if err != nil {
        return thread, err
    }
    // Attempt to resolve and persist conversation JSONL path if missing
    if strings.TrimSpace(updated.ConversationPath) == "" && strings.TrimSpace(updated.WorktreePath) != "" {
        if path := findLatestConversationPath(updated.WorktreePath); path != "" {
            _ = s.repo.UpdateThreadConversationPath(ctx, updated.ID, path)
            // refresh snapshot
            updated.ConversationPath = path
        }
    }
    s.mu.Lock()
    s.thread = updated
    s.mu.Unlock()
    return updated, nil
}

func (s *streamPersistence) threadSnapshot() discovery.Thread {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.thread
}

func (s *streamPersistence) createSystemEntry(ctx context.Context, tone, message string, meta map[string]any) *time.Time {
	if strings.TrimSpace(message) == "" {
		return nil
	}
	payload, err := marshalSystemMessagePayload(tone, message, meta)
	if err != nil {
		return nil
	}
	now := time.Now().UTC()
	if _, err := s.repo.CreateConversationEntry(ctx, discovery.CreateConversationEntryParams{
		ThreadID:  s.thread.ID,
		Role:      "system",
		EntryType: entryTypeSystemMessage,
		Payload:   payload,
		CreatedAt: now,
		UpdatedAt: now,
	}); err != nil {
		return nil
	}
	s.mu.Lock()
	s.lastActivity = &now
	s.mu.Unlock()
	return &now
}

// findLatestConversationPath searches for the most recent Codex session JSONL
// under the worktree path. It looks for ".codex/sessions/*.jsonl" paths in the
// worktree and its subdirectories and returns the most recently modified file.
func findLatestConversationPath(worktreePath string) string {
    root := strings.TrimSpace(worktreePath)
    if root == "" {
        return ""
    }
    var latest string
    var latestMod time.Time

    // Walk the worktree but prune directories aggressively
    _ = filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
        if err != nil {
            return nil
        }
        // Fast prune: only descend into .codex and its parent tree
        name := d.Name()
        if d.IsDir() {
            // Keep walking; but no special prune for now (worktrees are small)
            return nil
        }
        if !strings.HasSuffix(strings.ToLower(name), ".jsonl") {
            return nil
        }
        // require sessions directory in path
        if !strings.Contains(path, string(os.PathSeparator)+".codex"+string(os.PathSeparator)+"sessions"+string(os.PathSeparator)) &&
            !strings.HasSuffix(path, string(os.PathSeparator)+".codex"+string(os.PathSeparator)+"sessions") {
            return nil
        }
        info, ierr := d.Info()
        if ierr != nil {
            return nil
        }
        mod := info.ModTime()
        if latest == "" || mod.After(latestMod) {
            latest = path
            latestMod = mod
        }
        return nil
    })
    return latest
}
