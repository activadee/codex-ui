package agents

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"codex-ui/internal/git/worktrees"
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
	// Persist a stable, descriptive branch name for this thread (best effort)
	if err := s.repo.UpdateThreadBranchName(ctx, thread.ID, worktrees.BranchName(title, thread.ID)); err == nil {
		if updated, getErr := s.repo.GetThread(ctx, thread.ID); getErr == nil && updated.ID == thread.ID {
			thread = updated
		}
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
		BranchName:     record.BranchName,
		PRURL:          record.PRURL,
		Title:          record.Title,
		Model:          record.Model,
		SandboxMode:    record.SandboxMode,
		ReasoningLevel: record.ReasoningLevel,
		Status:         string(record.Status),
		CreatedAt:      record.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      record.UpdatedAt.Format(time.RFC3339),
	}
	branch := strings.TrimSpace(record.BranchName)
	if branch == "" {
		branch = fmt.Sprintf("codex/thread/%d", record.ID)
	}
	dto.Branch = branch
	if pr := parsePullRequestNumber(record.PRURL, record.ExternalID); pr != nil {
		dto.PullRequest = pr
	}
	if record.LastMessageAt != nil {
		formatted := record.LastMessageAt.Format(time.RFC3339)
		dto.LastMessageAt = &formatted
	}
	return dto
}

var pullRequestExtractor = regexp.MustCompile(`(?i)(?:pr|pull(?:_request)?)[^0-9]*(\d+)`)

func parsePullRequestNumber(values ...string) *int {
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		matches := pullRequestExtractor.FindStringSubmatch(value)
		if len(matches) < 2 {
			continue
		}
		parsed, err := strconv.Atoi(matches[1])
		if err != nil {
			continue
		}
		return &parsed
	}
	return nil
}
