package agents

import (
	"fmt"
	"strings"

	"codex-ui/internal/agents/connector"
	"codex-ui/internal/storage/discovery"
)

const (
	legacyItemTypeAgentMessage     = "agent_message"
	legacyItemTypeCommandExecution = "command_execution"
	legacyItemTypeFileChange       = "file_change"
	legacyItemTypeMcpToolCall      = "mcp_tool_call"
	legacyItemTypeWebSearch        = "web_search"
	legacyItemTypeTodoList         = "todo_list"
	legacyItemTypeError            = "error"
)

// MessageRequestToPrompt converts the legacy request DTO into a connector prompt.
func MessageRequestToPrompt(req MessageRequest) (connector.Prompt, error) {
	segments, err := legacySegmentsToPromptSegments(req.Segments)
	if err != nil {
		return connector.Prompt{}, err
	}

	text := strings.TrimSpace(req.Input)
	if text != "" {
		segments = append([]connector.PromptSegment{legacyTextSegment(req.Input)}, segments...)
	}

	if len(segments) == 0 {
		return connector.Prompt{}, fmt.Errorf("message request missing input segments")
	}

	metadata := buildPromptMetadata(req)
	return connector.Prompt{
		Author:   connector.PromptAuthorUser,
		Segments: segments,
		Metadata: metadata,
	}, nil
}

// SessionOptionsFromLegacy builds connector session options using persisted thread data.
func SessionOptionsFromLegacy(thread discovery.Thread, req MessageRequest, env map[string]string) connector.SessionOptions {
	opts := connector.SessionOptions{
		ProjectID:        thread.ProjectID,
		Thread:           thread,
		WorkingDirectory: strings.TrimSpace(req.ThreadOptions.WorkingDirectory),
		SandboxMode:      thread.SandboxMode,
		Env:              nil,
		Metadata:         map[string]any{},
	}
	if opts.WorkingDirectory == "" {
		opts.WorkingDirectory = thread.WorktreePath
	}
	if override := strings.TrimSpace(req.ThreadOptions.SandboxMode); override != "" {
		opts.SandboxMode = override
	}
	if len(env) > 0 {
		opts.Env = make(map[string]string, len(env))
		for key, value := range env {
			opts.Env[key] = value
		}
	}
	if req.ThreadExternalID != "" {
		opts.Metadata["threadExternalId"] = req.ThreadExternalID
	}
	if req.ThreadID != 0 {
		opts.Metadata["threadId"] = req.ThreadID
	}
	if len(opts.Metadata) == 0 {
		opts.Metadata = nil
	}
	return opts
}

// StreamEventToConnector converts the legacy StreamEvent into a connector.Event.
func StreamEventToConnector(event StreamEvent) connector.Event {
	converted := connector.Event{
		Type:     mapLegacyEventType(event.Type),
		ThreadID: event.ThreadID,
		Message:  event.Message,
	}
	if event.Item != nil {
		converted.Payload = legacyItemToPayload(*event.Item)
	}
	if event.Usage != nil {
		converted.Usage = &connector.TokenUsage{
			InputTokens:       event.Usage.InputTokens,
			CachedInputTokens: event.Usage.CachedInputTokens,
			OutputTokens:      event.Usage.OutputTokens,
		}
	}
	if event.Error != nil {
		converted.Error = &connector.EventError{Message: event.Error.Message}
	}
	return converted
}

// ConnectorEventToStream converts connector events back to the legacy StreamEvent DTO.
func ConnectorEventToStream(event connector.Event) StreamEvent {
	converted := StreamEvent{
		Type:     mapConnectorEventType(event.Type),
		ThreadID: event.ThreadID,
		Message:  event.Message,
	}
	if event.Payload != nil {
		converted.Item = connectorPayloadToLegacy(event.Payload)
	}
	if event.Usage != nil {
		converted.Usage = &UsageDTO{
			InputTokens:       event.Usage.InputTokens,
			CachedInputTokens: event.Usage.CachedInputTokens,
			OutputTokens:      event.Usage.OutputTokens,
		}
	}
	if event.Error != nil {
		converted.Error = &StreamError{Message: event.Error.Message}
	}
	return converted
}

func legacySegmentsToPromptSegments(segments []InputSegmentDTO) ([]connector.PromptSegment, error) {
	if len(segments) == 0 {
		return nil, nil
	}
	converted := make([]connector.PromptSegment, 0, len(segments))
	for idx, segment := range segments {
		switch segment.Type {
		case "text":
			if strings.TrimSpace(segment.Text) == "" {
				return nil, fmt.Errorf("segment %d text is empty", idx)
			}
			converted = append(converted, legacyTextSegment(segment.Text))
		case "image":
			if strings.TrimSpace(segment.ImagePath) == "" {
				return nil, fmt.Errorf("segment %d imagePath is empty", idx)
			}
			converted = append(converted, connector.PromptSegment{
				Kind: connector.SegmentKindImageLocal,
				Path: segment.ImagePath,
			})
		default:
			return nil, fmt.Errorf("segment %d has unsupported type %q", idx, segment.Type)
		}
	}
	return converted, nil
}

func legacyTextSegment(text string) connector.PromptSegment {
	return connector.PromptSegment{Kind: connector.SegmentKindText, Text: text}
}

func buildPromptMetadata(req MessageRequest) map[string]any {
	metadata := make(map[string]any)
	if req.AgentID != "" {
		metadata["agentId"] = req.AgentID
	}
	if req.ProjectID != 0 {
		metadata["projectId"] = req.ProjectID
	}
	if req.ThreadID != 0 {
		metadata["threadId"] = req.ThreadID
	}
	if req.ThreadExternalID != "" {
		metadata["threadExternalId"] = req.ThreadExternalID
	}
	if req.ThreadOptions.Model != "" {
		metadata["model"] = req.ThreadOptions.Model
	}
	if req.ThreadOptions.SandboxMode != "" {
		metadata["sandboxMode"] = req.ThreadOptions.SandboxMode
	}
	if req.ThreadOptions.ReasoningLevel != "" {
		metadata["reasoningLevel"] = req.ThreadOptions.ReasoningLevel
	}
	if req.ThreadOptions.WorkingDirectory != "" {
		metadata["workingDirectory"] = req.ThreadOptions.WorkingDirectory
	}
	if req.ThreadOptions.SkipGitRepoCheck {
		metadata["skipGitRepoCheck"] = true
	}
	if req.TurnOptions != nil && len(req.TurnOptions.OutputSchema) > 0 {
		metadata["outputSchema"] = req.TurnOptions.OutputSchema
	}
	if len(metadata) == 0 {
		return nil
	}
	return metadata
}

func mapLegacyEventType(eventType string) connector.EventType {
	switch eventType {
	case "thread.started":
		return connector.EventTypeSessionStarted
	case "turn.started":
		return connector.EventTypeTurnStarted
	case "turn.completed":
		return connector.EventTypeTurnCompleted
	case "turn.failed":
		return connector.EventTypeTurnFailed
	case "item.started":
		return connector.EventTypeItemCreated
	case "item.updated":
		return connector.EventTypeItemUpdated
	case "item.completed":
		return connector.EventTypeItemCompleted
	case "plan.updated":
		return connector.EventTypePlanUpdated
	case "tool.started":
		return connector.EventTypeToolStarted
	case "tool.completed":
		return connector.EventTypeToolCompleted
	case "diff.summary":
		return connector.EventTypeDiffSummary
	case "usage.updated":
		return connector.EventTypeUsageUpdated
	case "error":
		return connector.EventTypeSessionError
	default:
		return connector.EventType(eventType)
	}
}

func mapConnectorEventType(eventType connector.EventType) string {
	switch eventType {
	case connector.EventTypeSessionStarted:
		return "thread.started"
	case connector.EventTypeTurnStarted:
		return "turn.started"
	case connector.EventTypeTurnCompleted:
		return "turn.completed"
	case connector.EventTypeTurnFailed:
		return "turn.failed"
	case connector.EventTypeItemCreated:
		return "item.started"
	case connector.EventTypeItemUpdated:
		return "item.updated"
	case connector.EventTypeItemCompleted:
		return "item.completed"
	case connector.EventTypePlanUpdated:
		return "plan.updated"
	case connector.EventTypeToolStarted:
		return "tool.started"
	case connector.EventTypeToolCompleted:
		return "tool.completed"
	case connector.EventTypeDiffSummary:
		return "diff.summary"
	case connector.EventTypeUsageUpdated:
		return "usage.updated"
	case connector.EventTypeSessionError:
		return "error"
	default:
		return string(eventType)
	}
}

func legacyItemToPayload(item AgentItemDTO) connector.EventPayload {
	switch {
	case item.Command != nil:
		return &connector.CommandRun{
			ID:       item.ID,
			Command:  item.Command.Command,
			Output:   item.Command.AggregatedOutput,
			ExitCode: item.Command.ExitCode,
			Status:   item.Command.Status,
		}
	case len(item.FileDiffs) > 0:
		changes := make([]connector.FileChange, 0, len(item.FileDiffs))
		for _, diff := range item.FileDiffs {
			changes = append(changes, connector.FileChange{
				Path:   diff.Path,
				Kind:   diff.Kind,
				Status: diff.Status,
			})
		}
		return &connector.DiffChunk{ID: item.ID, Changes: changes}
	case item.ToolCall != nil:
		return &connector.ToolCall{
			ID:     item.ID,
			Server: item.ToolCall.Server,
			Tool:   item.ToolCall.Tool,
			Status: item.ToolCall.Status,
		}
	case item.WebSearch != nil:
		return &connector.WebSearch{ID: item.ID, Query: item.WebSearch.Query}
	case item.TodoList != nil:
		items := make([]connector.TodoItem, 0, len(item.TodoList.Items))
		for _, todo := range item.TodoList.Items {
			items = append(items, connector.TodoItem{Text: todo.Text, Completed: todo.Completed})
		}
		return &connector.TodoList{ID: item.ID, Items: items}
	case item.Error != nil:
		return &connector.ErrorItem{ID: item.ID, Message: item.Error.Message}
	default:
		return &connector.AgentMessage{ID: item.ID, Role: connector.PromptAuthorAssistant, Text: item.Text, Reasoning: item.Reasoning}
	}
}

func connectorPayloadToLegacy(payload connector.EventPayload) *AgentItemDTO {
	switch v := payload.(type) {
	case *connector.AgentMessage:
		return &AgentItemDTO{
			ID:        v.ID,
			Type:      legacyItemTypeAgentMessage,
			Text:      v.Text,
			Reasoning: v.Reasoning,
		}
	case *connector.CommandRun:
		return &AgentItemDTO{
			ID:   v.ID,
			Type: legacyItemTypeCommandExecution,
			Command: &CommandExecutionDTO{
				Command:          v.Command,
				AggregatedOutput: v.Output,
				ExitCode:         v.ExitCode,
				Status:           v.Status,
			},
		}
	case *connector.DiffChunk:
		changes := make([]FileChangeDTO, 0, len(v.Changes))
		for _, change := range v.Changes {
			changes = append(changes, FileChangeDTO{
				Path:   change.Path,
				Kind:   change.Kind,
				Status: change.Status,
			})
		}
		return &AgentItemDTO{ID: v.ID, Type: legacyItemTypeFileChange, FileDiffs: changes}
	case *connector.ToolCall:
		return &AgentItemDTO{
			ID:   v.ID,
			Type: legacyItemTypeMcpToolCall,
			ToolCall: &ToolCallDTO{
				Server: v.Server,
				Tool:   v.Tool,
				Status: v.Status,
			},
		}
	case *connector.WebSearch:
		return &AgentItemDTO{ID: v.ID, Type: legacyItemTypeWebSearch, WebSearch: &WebSearchDTO{Query: v.Query}}
	case *connector.TodoList:
		items := make([]TodoItemDTO, 0, len(v.Items))
		for _, todo := range v.Items {
			items = append(items, TodoItemDTO{Text: todo.Text, Completed: todo.Completed})
		}
		return &AgentItemDTO{ID: v.ID, Type: legacyItemTypeTodoList, TodoList: &TodoListDTO{Items: items}}
	case *connector.ErrorItem:
		return &AgentItemDTO{ID: v.ID, Type: legacyItemTypeError, Error: &ErrorItemDTO{Message: v.Message}}
	default:
		return nil
	}
}
