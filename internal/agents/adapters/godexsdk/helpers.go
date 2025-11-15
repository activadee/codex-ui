package godexsdk

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/activadee/godex"

	"codex-ui/internal/agents/connector"
)

const maxAttachmentSnippetSize = 512 * 1024 // 512KiB safety cap

func findSchema(prompts []connector.Prompt) []byte {
	for _, prompt := range prompts {
		if data, ok := metadataBytes(prompt.Metadata, "outputSchema"); ok {
			return data
		}
	}
	return nil
}

func metadataBytes(meta map[string]any, key string) ([]byte, bool) {
	if len(meta) == 0 {
		return nil, false
	}
	value, ok := meta[key]
	if !ok {
		return nil, false
	}
	switch v := value.(type) {
	case []byte:
		if len(v) == 0 {
			return nil, false
		}
		return v, true
	case json.RawMessage:
		if len(v) == 0 {
			return nil, false
		}
		return v, true
	case string:
		trimmed := strings.TrimSpace(v)
		if trimmed == "" {
			return nil, false
		}
		return []byte(trimmed), true
	default:
		data, err := json.Marshal(v)
		if err != nil || len(data) == 0 {
			return nil, false
		}
		return data, true
	}
}

func metadataString(meta map[string]any, key string) string {
	if len(meta) == 0 {
		return ""
	}
	value, ok := meta[key]
	if !ok {
		return ""
	}
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case []byte:
		return strings.TrimSpace(string(v))
	case json.RawMessage:
		return strings.TrimSpace(string(v))
	default:
		return strings.TrimSpace(fmt.Sprint(v))
	}
}

func promptsToInputs(prompts []connector.Prompt) ([]godex.InputSegment, string, error) {
	var segments []godex.InputSegment
	var fallback []string
	for _, prompt := range prompts {
		for _, segment := range prompt.Segments {
			switch segment.Kind {
			case connector.SegmentKindImageLocal:
				if path := strings.TrimSpace(segment.Path); path != "" {
					segments = append(segments, godex.LocalImageSegment(path))
				}
			case connector.SegmentKindCode:
				segments = append(segments, godex.TextSegment(codeBlock(segment.Lang, segment.Text)))
			case connector.SegmentKindMarkdown, connector.SegmentKindText:
				if segment.Text != "" {
					segments = append(segments, godex.TextSegment(segment.Text))
				}
			case connector.SegmentKindAttachmentRef:
				converted, err := attachmentSegments(segment)
				if err != nil {
					return nil, "", err
				}
				segments = append(segments, converted...)
			default:
				if segment.Text != "" {
					fallback = append(fallback, segment.Text)
				}
			}
		}
	}
	if len(segments) > 0 {
		return segments, "", nil
	}
	return nil, strings.Join(fallback, "\n\n"), nil
}

func codeBlock(lang, body string) string {
	trimmed := strings.TrimSpace(lang)
	if trimmed == "" {
		return fmt.Sprintf("```\n%s\n```", body)
	}
	return fmt.Sprintf("```%s\n%s\n```", trimmed, body)
}

func attachmentSegments(segment connector.PromptSegment) ([]godex.InputSegment, error) {
	path := strings.TrimSpace(segment.Path)
	if path == "" {
		return nil, fmt.Errorf("attachment path is empty")
	}
	info, err := os.Stat(path)
	if err != nil {
		return nil, fmt.Errorf("stat attachment %q: %w", path, err)
	}
	mimeType := attachmentMime(segment.Meta, path)
	if strings.HasPrefix(mimeType, "image/") {
		return []godex.InputSegment{godex.LocalImageSegment(path)}, nil
	}
	data, truncated, err := readAttachmentSnippet(path)
	if err != nil {
		return nil, fmt.Errorf("read attachment %q: %w", path, err)
	}
	if mimeType == "" && len(data) > 0 {
		mimeType = http.DetectContentType(data)
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	var text string
	if isTextLike(mimeType, data) {
		text = formatTextAttachment(path, mimeType, data, truncated)
	} else {
		text = formatBinaryAttachment(path, mimeType, info.Size(), data, truncated)
	}
	return []godex.InputSegment{godex.TextSegment(text)}, nil
}

func attachmentMime(meta map[string]any, path string) string {
	if value := metadataString(meta, "mime"); value != "" {
		return value
	}
	if value := metadataString(meta, "mimeType"); value != "" {
		return value
	}
	if value := metadataString(meta, "contentType"); value != "" {
		return value
	}
	ext := strings.ToLower(filepath.Ext(path))
	if ext == "" {
		return ""
	}
	if !strings.HasPrefix(ext, ".") {
		ext = "." + ext
	}
	return mime.TypeByExtension(ext)
}

func readAttachmentSnippet(path string) ([]byte, bool, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, false, err
	}
	defer f.Close()
	reader := io.LimitReader(f, maxAttachmentSnippetSize+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, false, err
	}
	truncated := len(data) > maxAttachmentSnippetSize
	if truncated {
		data = data[:maxAttachmentSnippetSize]
	}
	return data, truncated, nil
}

func isTextLike(mimeType string, data []byte) bool {
	if strings.HasPrefix(mimeType, "text/") || mimeType == "application/json" || mimeType == "application/xml" {
		return true
	}
	if len(data) == 0 {
		return true
	}
	if !utf8.Valid(data) {
		return false
	}
	for _, b := range data {
		if b == 0 {
			return false
		}
	}
	return true
}

func formatTextAttachment(path, mimeType string, data []byte, truncated bool) string {
	name := filepath.Base(path)
	body := string(data)
	lang := attachmentLanguageFromPath(path)
	if lang == "" {
		lang = metadataLanguageHint(mimeType)
	}
	text := fmt.Sprintf("Attachment %s (%s)", name, mimeType)
	if truncated {
		text += fmt.Sprintf(" – showing first %d bytes", maxAttachmentSnippetSize)
	}
	return text + "\n" + codeBlock(lang, body)
}

func formatBinaryAttachment(path, mimeType string, total int64, data []byte, truncated bool) string {
	name := filepath.Base(path)
	encoded := base64.StdEncoding.EncodeToString(data)
	text := fmt.Sprintf("Attachment %s (%s, %d bytes)", name, mimeType, total)
	if truncated {
		text += fmt.Sprintf(" – included first %d bytes", len(data))
	}
	return text + "\n" + encoded
}

func attachmentLanguageFromPath(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".go":
		return "go"
	case ".py":
		return "python"
	case ".js":
		return "javascript"
	case ".ts":
		return "typescript"
	case ".rs":
		return "rust"
	case ".java":
		return "java"
	case ".rb":
		return "ruby"
	case ".php":
		return "php"
	case ".cs":
		return "csharp"
	case ".cpp":
		return "cpp"
	case ".c":
		return "c"
	case ".swift":
		return "swift"
	case ".kt":
		return "kotlin"
	case ".sql":
		return "sql"
	case ".sh":
		return "bash"
	case ".json":
		return "json"
	case ".yaml", ".yml":
		return "yaml"
	default:
		return ""
	}
}

func metadataLanguageHint(mimeType string) string {
	switch mimeType {
	case "application/json":
		return "json"
	case "application/xml", "text/xml":
		return "xml"
	case "text/html":
		return "html"
	case "text/css":
		return "css"
	default:
		return ""
	}
}

func convertThreadEvent(event godex.ThreadEvent, threadID string) connector.Event {
	converted := connector.Event{
		ThreadID:  threadID,
		Type:      connector.EventTypeCustom,
		Timestamp: time.Now(),
	}
	switch e := event.(type) {
	case godex.ThreadStartedEvent:
		converted.Type = connector.EventTypeSessionStarted
		converted.ThreadID = e.ThreadID
	case godex.TurnStartedEvent:
		converted.Type = connector.EventTypeTurnStarted
	case godex.TurnCompletedEvent:
		converted.Type = connector.EventTypeTurnCompleted
		converted.Usage = &connector.TokenUsage{
			InputTokens:       e.Usage.InputTokens,
			CachedInputTokens: e.Usage.CachedInputTokens,
			OutputTokens:      e.Usage.OutputTokens,
		}
	case godex.TurnFailedEvent:
		converted.Type = connector.EventTypeTurnFailed
		if e.Error.Message != "" {
			converted.Message = e.Error.Message
			converted.Error = &connector.EventError{Message: e.Error.Message}
		}
	case godex.ItemStartedEvent:
		converted.Type = connector.EventTypeItemCreated
		converted.Payload, converted.Message = convertThreadItem(e.Item)
	case godex.ItemUpdatedEvent:
		converted.Type = connector.EventTypeItemUpdated
		converted.Payload, converted.Message = convertThreadItem(e.Item)
	case godex.ItemCompletedEvent:
		converted.Type = connector.EventTypeItemCompleted
		converted.Payload, converted.Message = convertThreadItem(e.Item)
	case godex.ThreadErrorEvent:
		converted.Type = connector.EventTypeSessionError
		converted.Message = e.Message
		converted.Error = &connector.EventError{Message: e.Message}
	}
	return converted
}

func convertThreadItem(item godex.ThreadItem) (connector.EventPayload, string) {
	switch v := item.(type) {
	case godex.AgentMessageItem:
		return &connector.AgentMessage{ID: v.ID, Role: connector.PromptAuthorAssistant, Text: v.Text}, v.Text
	case godex.ReasoningItem:
		return &connector.AgentMessage{ID: v.ID, Role: connector.PromptAuthorAssistant, Reasoning: v.Text}, v.Text
	case godex.CommandExecutionItem:
		return &connector.CommandRun{ID: v.ID, Command: v.Command, Output: v.AggregatedOutput, ExitCode: v.ExitCode, Status: string(v.Status)}, v.AggregatedOutput
	case godex.FileChangeItem:
		changes := make([]connector.FileChange, 0, len(v.Changes))
		for _, change := range v.Changes {
			changes = append(changes, connector.FileChange{Path: change.Path, Kind: string(change.Kind), Status: string(v.Status)})
		}
		return &connector.DiffChunk{ID: v.ID, Changes: changes}, ""
	case godex.McpToolCallItem:
		return &connector.ToolCall{ID: v.ID, Server: v.Server, Tool: v.Tool, Status: string(v.Status)}, ""
	case godex.WebSearchItem:
		return &connector.WebSearch{ID: v.ID, Query: v.Query}, v.Query
	case godex.TodoListItem:
		items := make([]connector.TodoItem, 0, len(v.Items))
		for _, item := range v.Items {
			items = append(items, connector.TodoItem{Text: item.Text, Completed: item.Completed})
		}
		return &connector.TodoList{ID: v.ID, Items: items}, ""
	case godex.ErrorItem:
		return &connector.ErrorItem{ID: v.ID, Message: v.Message}, v.Message
	default:
		return nil, ""
	}
}
