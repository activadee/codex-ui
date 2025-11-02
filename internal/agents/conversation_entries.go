package agents

import (
	"encoding/json"
	"fmt"
	"time"

	"codex-ui/internal/storage/discovery"
)

const (
	entryTypeUserMessage    = "user_message"
	entryTypeAgentMessage   = "agent_message"
	entryTypeAgentReasoning = "agent_reasoning"
	entryTypeSystemMessage  = "system_message"
)

type userEntryPayload struct {
	Text     string            `json:"text"`
	Segments []InputSegmentDTO `json:"segments,omitempty"`
}

type systemMessagePayload struct {
	Tone    string         `json:"tone,omitempty"`
	Message string         `json:"message"`
	Meta    map[string]any `json:"meta,omitempty"`
}

func marshalUserEntryPayload(text string, segments []InputSegmentDTO) (json.RawMessage, error) {
	payload := userEntryPayload{Text: text, Segments: segments}
	return json.Marshal(payload)
}

func marshalAgentItemPayload(item *AgentItemDTO) (json.RawMessage, error) {
	if item == nil {
		return nil, nil
	}
	return json.Marshal(item)
}

func marshalSystemMessagePayload(tone, message string, meta map[string]any) (json.RawMessage, error) {
	payload := systemMessagePayload{Tone: tone, Message: message, Meta: meta}
	return json.Marshal(payload)
}

func buildUsageSystemMessage(usage *UsageDTO) (string, map[string]any) {
	if usage == nil {
		return "", nil
	}
	message := fmt.Sprintf("Usage · in %d / out %d", usage.InputTokens, usage.OutputTokens)
	meta := map[string]any{
		"inputTokens":       usage.InputTokens,
		"cachedInputTokens": usage.CachedInputTokens,
		"outputTokens":      usage.OutputTokens,
	}
	return message, meta
}

func conversationEntryToDTO(entry discovery.ConversationEntry) (ConversationEntryDTO, error) {
	dto := ConversationEntryDTO{
		ID:        fmt.Sprintf("entry-%d", entry.ID),
		Role:      entry.Role,
		CreatedAt: entry.CreatedAt.Format(time.RFC3339),
	}
	if !entry.UpdatedAt.IsZero() {
		updated := entry.UpdatedAt.Format(time.RFC3339)
		dto.UpdatedAt = &updated
	}

	switch entry.Role {
	case "user":
		if len(entry.Payload) == 0 {
			return dto, nil
		}
		var payload userEntryPayload
		if err := json.Unmarshal(entry.Payload, &payload); err != nil {
			return dto, fmt.Errorf("decode user entry payload: %w", err)
		}
		dto.Text = payload.Text
		dto.Segments = payload.Segments
	case "agent":
		if len(entry.Payload) > 0 {
			var payload AgentItemDTO
			if err := json.Unmarshal(entry.Payload, &payload); err != nil {
				return dto, fmt.Errorf("decode agent payload: %w", err)
			}
			if payload.Type == "" {
				payload.Type = entry.EntryType
			}
			if payload.ID == "" {
				payload.ID = dto.ID
			}
			dto.Item = &payload
		} else {
			dto.Item = &AgentItemDTO{
				ID:   dto.ID,
				Type: entry.EntryType,
			}
		}
	case "system":
		var payload systemMessagePayload
		if len(entry.Payload) > 0 {
			if err := json.Unmarshal(entry.Payload, &payload); err != nil {
				return dto, fmt.Errorf("decode system message payload: %w", err)
			}
		}
		dto.Tone = payload.Tone
		dto.Message = payload.Message
		dto.Meta = payload.Meta
	}

	return dto, nil
}
