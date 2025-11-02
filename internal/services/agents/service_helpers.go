package agents

import (
	"context"
	"errors"
	"strings"
	"time"

	"codex-ui/internal/storage/discovery"
)

var errRepositoryUnavailable = errors.New("agent repository not initialised")

func (s *Service) ensureRepo() error {
	if s.repo == nil {
		return errRepositoryUnavailable
	}
	return nil
}

func (s *Service) prepareThread(ctx context.Context, req *MessageRequest) (discovery.Thread, error) {
	if err := s.ensureRepo(); err != nil {
		return discovery.Thread{}, err
	}

    if req.ThreadID != 0 {
        thread, err := s.repo.GetThread(ctx, req.ThreadID)
        if err != nil {
            return discovery.Thread{}, err
        }
        // Persist latest thread options if they changed (keep per-thread preferences in sync)
        // We only attempt update when a model is provided (UI always sends one)
        if strings.TrimSpace(req.ThreadOptions.Model) != "" && (
            req.ThreadOptions.Model != thread.Model ||
            req.ThreadOptions.SandboxMode != thread.SandboxMode ||
            req.ThreadOptions.ReasoningLevel != thread.ReasoningLevel,
        ) {
            if uerr := s.repo.UpdateThreadOptions(ctx, thread.ID,
                req.ThreadOptions.Model,
                req.ThreadOptions.SandboxMode,
                req.ThreadOptions.ReasoningLevel,
            ); uerr == nil {
                // refresh snapshot if update succeeded
                if updated, gerr := s.repo.GetThread(ctx, thread.ID); gerr == nil {
                    thread = updated
                }
            }
        }
        req.ThreadExternalID = thread.ExternalID
        return thread, nil
    }

	if req.ProjectID == 0 {
		return discovery.Thread{}, errors.New("projectId is required for new threads")
	}

	title := deriveTitle(req.Input, req.Segments)
	params := discovery.CreateThreadParams{
		ProjectID:      req.ProjectID,
		Title:          title,
		Model:          req.ThreadOptions.Model,
		SandboxMode:    req.ThreadOptions.SandboxMode,
		ReasoningLevel: req.ThreadOptions.ReasoningLevel,
	}
	thread, err := s.repo.CreateThread(ctx, params)
	if err != nil {
		return discovery.Thread{}, err
	}
	req.ThreadID = thread.ID
	req.ThreadExternalID = thread.ExternalID
	return thread, nil
}

func deriveTitle(input string, segments []InputSegmentDTO) string {
	text := strings.TrimSpace(input)
	if text == "" && len(segments) > 0 {
		var parts []string
		for _, seg := range segments {
			if seg.Type == "text" && strings.TrimSpace(seg.Text) != "" {
				parts = append(parts, strings.TrimSpace(seg.Text))
			}
		}
		text = strings.Join(parts, " ")
	}
	if text == "" {
		return "Untitled thread"
	}
	words := strings.Fields(text)
	if len(words) > 8 {
		words = words[:8]
	}
	return strings.Join(words, " ")
}

func deriveUserMessageText(req MessageRequest) string {
	if trimmed := strings.TrimSpace(req.Input); trimmed != "" {
		return trimmed
	}
	if len(req.Segments) == 0 {
		return ""
	}
	var textParts []string
	for _, seg := range req.Segments {
		switch seg.Type {
		case "text":
			if trimmed := strings.TrimSpace(seg.Text); trimmed != "" {
				textParts = append(textParts, trimmed)
			}
		case "image":
			if path := strings.TrimSpace(seg.ImagePath); path != "" {
				textParts = append(textParts, "[image]"+path)
			}
		}
	}
	return strings.TrimSpace(strings.Join(textParts, "\n\n"))
}

func toThreadDTO(record discovery.Thread) ThreadDTO {
	dto := ThreadDTO{
		ID:             record.ID,
		ProjectID:      record.ProjectID,
		ExternalID:     record.ExternalID,
		WorktreePath:   record.WorktreePath,
		Title:          record.Title,
		Model:          record.Model,
		SandboxMode:    record.SandboxMode,
		ReasoningLevel: record.ReasoningLevel,
		Status:         string(record.Status),
		CreatedAt:      record.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      record.UpdatedAt.Format(time.RFC3339),
	}
	if record.LastMessageAt != nil {
		formatted := record.LastMessageAt.Format(time.RFC3339)
		dto.LastMessageAt = &formatted
	}
	return dto
}
