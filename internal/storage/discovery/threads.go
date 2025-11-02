package discovery

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// ThreadStatus enumerates lifecycle states for a thread.
type ThreadStatus string

const (
	ThreadStatusActive    ThreadStatus = "active"
	ThreadStatusCompleted ThreadStatus = "completed"
	ThreadStatusStopped   ThreadStatus = "stopped"
	ThreadStatusFailed    ThreadStatus = "failed"
)

// Thread represents a persisted conversation thread.
type Thread struct {
	ID               int64        `json:"id"`
	ProjectID        int64        `json:"projectId"`
	ExternalID       string       `json:"externalId,omitempty"`
	ConversationPath string       `json:"conversationPath,omitempty"`
	WorktreePath     string       `json:"worktreePath,omitempty"`
	Title            string       `json:"title"`
	Model            string       `json:"model"`
	SandboxMode      string       `json:"sandboxMode"`
	ReasoningLevel   string       `json:"reasoningLevel"`
	Status           ThreadStatus `json:"status"`
	CreatedAt        time.Time    `json:"createdAt"`
	UpdatedAt        time.Time    `json:"updatedAt"`
	LastMessageAt    *time.Time   `json:"lastMessageAt,omitempty"`
}

// ConversationEntry represents a stored conversation transcript item.
type ConversationEntry struct {
	ID        int64           `json:"id"`
	ThreadID  int64           `json:"threadId"`
	Role      string          `json:"role"`
	EntryType string          `json:"entryType"`
	Payload   json.RawMessage `json:"payload,omitempty"`
	CreatedAt time.Time       `json:"createdAt"`
	UpdatedAt time.Time       `json:"updatedAt"`
}

// CreateThreadParams bundles the information required to persist a thread.
type CreateThreadParams struct {
	ProjectID      int64
	Title          string
	Model          string
	SandboxMode    string
	ReasoningLevel string
}

// CreateThread inserts a new thread record.
func (r *Repository) CreateThread(ctx context.Context, params CreateThreadParams) (Thread, error) {
	res, err := r.db.ExecContext(ctx, `
        INSERT INTO threads (project_id, title, model, sandbox_mode, reasoning_level)
        VALUES (?, ?, ?, ?, ?)
    `, params.ProjectID, params.Title, params.Model, params.SandboxMode, params.ReasoningLevel)
	if err != nil {
		return Thread{}, fmt.Errorf("insert thread: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Thread{}, fmt.Errorf("thread last insert id: %w", err)
	}
	return r.GetThread(ctx, id)
}

// GetThread retrieves a thread by identifier.
func (r *Repository) GetThread(ctx context.Context, id int64) (Thread, error) {
	var (
		t               Thread
		externalID      sql.NullString
		conversationRaw sql.NullString
		worktreePath    sql.NullString
		lastMessageAt   sql.NullTime
	)
	err := r.db.QueryRowContext(ctx, `
            SELECT id, project_id, external_id, conversation_path, worktree_path, title, model, sandbox_mode, reasoning_level, status, created_at, updated_at, last_message_at
            FROM threads
            WHERE id = ?
        `, id).Scan(&t.ID, &t.ProjectID, &externalID, &conversationRaw, &worktreePath, &t.Title, &t.Model, &t.SandboxMode, &t.ReasoningLevel, &t.Status, &t.CreatedAt, &t.UpdatedAt, &lastMessageAt)
	if err != nil {
		return Thread{}, fmt.Errorf("select thread: %w", err)
	}

	if externalID.Valid {
		t.ExternalID = externalID.String
	}
	if conversationRaw.Valid {
		t.ConversationPath = conversationRaw.String
	}
	if worktreePath.Valid {
		t.WorktreePath = worktreePath.String
	}
	if lastMessageAt.Valid {
		t.LastMessageAt = &lastMessageAt.Time
	}
	return t, nil
}

// ListThreadsByProject lists threads ordered by recency.
func (r *Repository) ListThreadsByProject(ctx context.Context, projectID int64) ([]Thread, error) {
	var (
		rows *sql.Rows
		err  error
	)
	rows, err = r.db.QueryContext(ctx, `
            SELECT id, project_id, external_id, conversation_path, worktree_path, title, model, sandbox_mode, reasoning_level, status, created_at, updated_at, last_message_at
            FROM threads
            WHERE project_id = ?
            ORDER BY COALESCE(last_message_at, updated_at) DESC, id DESC
        `, projectID)
	if err != nil {
		return nil, fmt.Errorf("query threads: %w", err)
	}
	defer rows.Close()

	var threads []Thread
	for rows.Next() {
		var (
			t               Thread
			externalID      sql.NullString
			conversationRaw sql.NullString
			worktreePath    sql.NullString
			lastMessageAt   sql.NullTime
		)
		scanErr := rows.Scan(&t.ID, &t.ProjectID, &externalID, &conversationRaw, &worktreePath, &t.Title, &t.Model, &t.SandboxMode, &t.ReasoningLevel, &t.Status, &t.CreatedAt, &t.UpdatedAt, &lastMessageAt)
		if scanErr != nil {
			fmt.Println("Scan error:", scanErr)
			return nil, fmt.Errorf("scan thread: %w", scanErr)
		}
		if externalID.Valid {
			t.ExternalID = externalID.String
		}
		if conversationRaw.Valid {
			t.ConversationPath = conversationRaw.String
		}
		if worktreePath.Valid {
			t.WorktreePath = worktreePath.String
		}
		if lastMessageAt.Valid {
			t.LastMessageAt = &lastMessageAt.Time
		}
		threads = append(threads, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate threads: %w", err)
	}
	return threads, nil
}

// UpdateThreadStatus updates the thread status and optionally last_message_at timestamp.
func (r *Repository) UpdateThreadStatus(ctx context.Context, id int64, status ThreadStatus, lastMessageAt *time.Time) error {
	_, err := r.db.ExecContext(ctx, `
        UPDATE threads
        SET status = ?,
            last_message_at = COALESCE(?, last_message_at),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, status, lastMessageAt, id)
	if err != nil {
		return fmt.Errorf("update thread status: %w", err)
	}
	return nil
}

// TouchThreadActivity updates last_message_at to the provided value.
func (r *Repository) TouchThreadActivity(ctx context.Context, id int64, ts time.Time) error {
	_, err := r.db.ExecContext(ctx, `
        UPDATE threads
        SET last_message_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, ts, id)
	if err != nil {
		return fmt.Errorf("touch thread activity: %w", err)
	}
	return nil
}

// UpdateThreadTitle updates a thread title.
func (r *Repository) UpdateThreadTitle(ctx context.Context, id int64, title string) error {
	_, err := r.db.ExecContext(ctx, `
        UPDATE threads
        SET title = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, title, id)
	if err != nil {
		return fmt.Errorf("update thread title: %w", err)
	}
	return nil
}

// UpdateThreadOptions updates model, sandbox_mode, and reasoning_level for a thread.
func (r *Repository) UpdateThreadOptions(ctx context.Context, id int64, model, sandboxMode, reasoningLevel string) error {
    _, err := r.db.ExecContext(ctx, `
        UPDATE threads
        SET model = ?,
            sandbox_mode = ?,
            reasoning_level = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, model, sandboxMode, reasoningLevel, id)
    if err != nil {
        return fmt.Errorf("update thread options: %w", err)
    }
    return nil
}

// UpdateThreadExternalID stores the remote identifier for a thread.
func (r *Repository) UpdateThreadExternalID(ctx context.Context, id int64, externalID string) error {
	_, err := r.db.ExecContext(ctx, `
        UPDATE threads
        SET external_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, externalID, id)
	if err != nil {
		return fmt.Errorf("update thread external id: %w", err)
	}
	return nil
}

// UpdateThreadConversationPath stores the resolved JSONL history path for a thread.
func (r *Repository) UpdateThreadConversationPath(ctx context.Context, id int64, path string) error {
	_, err := r.db.ExecContext(ctx, `
        UPDATE threads
        SET conversation_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, nullIfEmpty(path), id)
	if err != nil {
		return fmt.Errorf("update thread conversation path: %w", err)
	}
	return nil
}

// UpdateThreadWorktreePath stores the local worktree path for a thread.
func (r *Repository) UpdateThreadWorktreePath(ctx context.Context, id int64, path string) error {
	_, err := r.db.ExecContext(ctx, `
        UPDATE threads
        SET worktree_path = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `, nullIfEmpty(path), id)
	if err != nil {
		return fmt.Errorf("update thread worktree path: %w", err)
	}
	return nil
}

// DeleteThread removes a thread and cascades entries via foreign key constraints.
func (r *Repository) DeleteThread(ctx context.Context, id int64) error {
	res, err := r.db.ExecContext(ctx, `
        DELETE FROM threads
        WHERE id = ?
    `, id)
	if err != nil {
		return fmt.Errorf("delete thread: %w", err)
	}
	if rows, rerr := res.RowsAffected(); rerr == nil && rows == 0 {
		return sql.ErrNoRows
	}
	return nil
}

func maybeNullJSON(raw json.RawMessage) interface{} {
	if len(raw) == 0 {
		return nil
	}
	return string(raw)
}

// CreateConversationEntryParams bundles the data required to persist a conversation entry.
type CreateConversationEntryParams struct {
	ThreadID  int64
	Role      string
	EntryType string
	Payload   json.RawMessage
	CreatedAt time.Time
	UpdatedAt time.Time
}

// CreateConversationEntry inserts a conversation entry record.
func (r *Repository) CreateConversationEntry(ctx context.Context, params CreateConversationEntryParams) (ConversationEntry, error) {
	createdAt := params.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	updatedAt := params.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = createdAt
	}

	res, err := r.db.ExecContext(ctx, `
        INSERT INTO thread_entries (thread_id, role, entry_type, payload, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    `, params.ThreadID, params.Role, params.EntryType, maybeNullJSON(params.Payload), createdAt, updatedAt)
	if err != nil {
		return ConversationEntry{}, fmt.Errorf("insert conversation entry: %w", err)
	}
	id, err := res.LastInsertId()
	if err != nil {
		return ConversationEntry{}, fmt.Errorf("conversation entry last insert id: %w", err)
	}
	return r.GetConversationEntry(ctx, id)
}

// GetConversationEntry retrieves a conversation entry by identifier.
func (r *Repository) GetConversationEntry(ctx context.Context, id int64) (ConversationEntry, error) {
	var (
		entry   ConversationEntry
		payload sql.NullString
	)
	err := r.db.QueryRowContext(ctx, `
        SELECT id, thread_id, role, entry_type, payload, created_at, updated_at
        FROM thread_entries
        WHERE id = ?
    `, id).Scan(&entry.ID, &entry.ThreadID, &entry.Role, &entry.EntryType, &payload, &entry.CreatedAt, &entry.UpdatedAt)
	if err != nil {
		return ConversationEntry{}, fmt.Errorf("select conversation entry: %w", err)
	}
	if payload.Valid {
		entry.Payload = json.RawMessage(payload.String)
	}
	return entry, nil
}

// ListConversationEntries returns entries ordered chronologically for a thread.
func (r *Repository) ListConversationEntries(ctx context.Context, threadID int64) ([]ConversationEntry, error) {
	rows, err := r.db.QueryContext(ctx, `
        SELECT id, thread_id, role, entry_type, payload, created_at, updated_at
        FROM thread_entries
        WHERE thread_id = ?
        ORDER BY created_at ASC, id ASC
    `, threadID)
	if err != nil {
		return nil, fmt.Errorf("query conversation entries: %w", err)
	}
	defer rows.Close()

	var entries []ConversationEntry
	for rows.Next() {
		var (
			entry   ConversationEntry
			payload sql.NullString
		)
		if err := rows.Scan(&entry.ID, &entry.ThreadID, &entry.Role, &entry.EntryType, &payload, &entry.CreatedAt, &entry.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan conversation entry: %w", err)
		}
		if payload.Valid {
			entry.Payload = json.RawMessage(payload.String)
		}
		entries = append(entries, entry)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate conversation entries: %w", err)
	}
	return entries, nil
}
