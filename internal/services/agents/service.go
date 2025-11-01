package agents

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"codex-ui/internal/storage/discovery"
	"codex-ui/internal/worktrees"
	"time"

	"github.com/google/uuid"
)

// Adapter defines the behaviour required to interact with an agent provider.
type Adapter interface {
	Stream(ctx context.Context, req MessageRequest) (*StreamResult, error)
}

// StreamResult is returned by adapters to surface event channels and lifecycle hooks.
type StreamResult struct {
	Events <-chan StreamEvent
	Done   <-chan error
	Close  func() error
}

// Service routes requests to registered adapters.
type Service struct {
	mu           sync.RWMutex
	adapters     map[string]Adapter
	defaultAgent string
	repo         *discovery.Repository

	activeMu sync.Mutex
	active   map[string]*activeStream

	worktrees *worktrees.Manager
	// cleanup controls
	cleanupStop chan struct{}
}

// NewService constructs an empty service.
type ServiceOption func(*Service)

func WithWorktreeManager(m *worktrees.Manager) ServiceOption {
	return func(s *Service) { s.worktrees = m }
}

func NewService(defaultAgent string, repo *discovery.Repository, opts ...ServiceOption) *Service {
	s := &Service{
		adapters:     make(map[string]Adapter),
		defaultAgent: defaultAgent,
		repo:         repo,
		active:       make(map[string]*activeStream),
	}
	for _, opt := range opts {
		if opt != nil {
			opt(s)
		}
	}
	return s
}

// Register associates an adapter with an agent identifier.
func (s *Service) Register(agentID string, adapter Adapter) error {
	if strings.TrimSpace(agentID) == "" {
		return errors.New("agent id is required")
	}
	if adapter == nil {
		return errors.New("adapter is required")
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.adapters[agentID] = adapter
	return nil
}

// StreamInitialTopicPrefix defines the event prefix used for runtime emissions.
const StreamInitialTopicPrefix = "agent:stream:"
const fileChangeTopicPrefix = "agent:file-change:"
const terminalTopicPrefix = "agent:terminal:"

// StreamTopic returns the runtime event topic for a given stream ID.
func StreamTopic(streamID string) string {
	return StreamInitialTopicPrefix + streamID
}

// FileChangeTopic returns the runtime event topic for file change notifications.
func FileChangeTopic(threadID int64) string {
	return fmt.Sprintf("%s%d", fileChangeTopicPrefix, threadID)
}

// TerminalTopic returns the runtime event topic for terminal streaming.
func TerminalTopic(threadID int64) string {
	return fmt.Sprintf("%s%d", terminalTopicPrefix, threadID)
}

// Stream represents a running agent interaction.
type Stream struct {
	id      string
	events  <-chan StreamEvent
	done    <-chan error
	closeFn func() error

	closeOnce sync.Once
	waitOnce  sync.Once
	waitErr   error
}

type activeStream struct {
	stream   *Stream
	threadID int64
	cancel   func() error
	state    *streamPersistence
}

// ID returns the stream identifier.
func (s *Stream) ID() string {
	if s == nil {
		return ""
	}
	return s.id
}

// Events yields the event channel.
func (s *Stream) Events() <-chan StreamEvent {
	if s == nil {
		return nil
	}
	return s.events
}

// Close cancels the underlying stream.
func (s *Stream) Close() error {
	if s == nil || s.closeFn == nil {
		return nil
	}
	var err error
	s.closeOnce.Do(func() {
		err = s.closeFn()
	})
	return err
}

// Wait blocks until the stream finishes and returns the terminal error, if any.
func (s *Stream) Wait() error {
	if s == nil || s.done == nil {
		return nil
	}
	s.waitOnce.Do(func() {
		err, ok := <-s.done
		if ok {
			s.waitErr = err
		}
		// if channel closed without value, err remains nil
	})
	return s.waitErr
}

// Send starts streaming a message through the selected agent adapter.
func (s *Service) Send(ctx context.Context, req MessageRequest) (*Stream, discovery.Thread, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	agentID := strings.TrimSpace(req.AgentID)
	if agentID == "" {
		agentID = s.defaultAgent
	}
	if agentID == "" {
		return nil, discovery.Thread{}, errors.New("agent id is required")
	}

	if strings.TrimSpace(req.Input) == "" && len(req.Segments) == 0 {
		return nil, discovery.Thread{}, errors.New("input text or segments are required")
	}

	adapter, err := s.loadAdapter(agentID)
	if err != nil {
		return nil, discovery.Thread{}, err
	}

	thread, err := s.prepareThread(ctx, &req)
	if err != nil {
		return nil, discovery.Thread{}, err
	}

	// Ensure worktree + working directory override
	if s.worktrees != nil {
		project, perr := s.repo.GetProjectByID(ctx, thread.ProjectID)
		if perr != nil {
			return nil, discovery.Thread{}, perr
		}
		// Build descriptive naming for worktree dir + branch
		nameHint := thread.Title
		branchName := thread.BranchName
		wtPath, workingDir, _, werr := s.worktrees.EnsureForThread(ctx, project.Path, thread.ID, nameHint, branchName)
		if werr != nil {
			return nil, discovery.Thread{}, werr
		}
		_ = s.repo.UpdateThreadWorktreePath(ctx, thread.ID, wtPath)
		thread.WorktreePath = wtPath
		req.ThreadOptions.WorkingDirectory = workingDir
		req.ThreadOptions.SkipGitRepoCheck = false
	}

	userContent := deriveUserMessageText(req)
	hasSegments := len(req.Segments) > 0
	if trimmed := strings.TrimSpace(userContent); trimmed != "" || hasSegments {
		payload, err := marshalUserEntryPayload(userContent, req.Segments)
		if err != nil {
			return nil, discovery.Thread{}, err
		}
		entry, err := s.repo.CreateConversationEntry(ctx, discovery.CreateConversationEntryParams{
			ThreadID:  thread.ID,
			Role:      "user",
			EntryType: entryTypeUserMessage,
			Payload:   payload,
		})
		if err != nil {
			return nil, discovery.Thread{}, err
		}
		if err := s.repo.TouchThreadActivity(ctx, thread.ID, entry.CreatedAt); err != nil {
			return nil, discovery.Thread{}, err
		}
		createdAt := entry.CreatedAt
		thread.LastMessageAt = &createdAt
	}

	streamCtx, cancel := context.WithCancel(ctx)
	result, err := adapter.Stream(streamCtx, req)
	if err != nil {
		cancel()
		return nil, discovery.Thread{}, err
	}

	state := newStreamPersistence(s.repo, thread)

	events := make(chan StreamEvent)
	done := make(chan error, 1)

	streamID := uuid.NewString()

	stream := &Stream{
		id:     streamID,
		events: events,
		done:   done,
		closeFn: func() error {
			cancel()
			if result.Close != nil {
				return result.Close()
			}
			return nil
		},
	}

	active := &activeStream{
		stream:   stream,
		threadID: thread.ID,
		cancel:   stream.Close,
		state:    state,
	}

	s.activeMu.Lock()
	s.active[streamID] = active
	s.activeMu.Unlock()

	go s.forwardStream(streamCtx, streamID, active, result, events, done)

	return stream, thread, nil
}

func (s *Service) loadAdapter(agentID string) (Adapter, error) {
	s.mu.RLock()
	adapter, ok := s.adapters[agentID]
	s.mu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("agent %s not registered", agentID)
	}
	return adapter, nil
}

func (s *Service) forwardStream(ctx context.Context, streamID string, active *activeStream, result *StreamResult, events chan<- StreamEvent, done chan<- error) {
	defer close(events)
	defer close(done)
	defer s.unregisterActive(streamID)

	var streamErr error

	for event := range result.Events {
		s.processEvent(ctx, active.state, event)
		select {
		case events <- event:
		case <-ctx.Done():
			streamErr = ctx.Err()
			goto finalize
		}
	}

	select {
	case err, ok := <-result.Done:
		if ok && err != nil {
			streamErr = err
		}
	default:
	}

finalize:
	status := discovery.ThreadStatusCompleted
	if streamErr != nil && active.state != nil {
		if errors.Is(streamErr, context.Canceled) {
			status = discovery.ThreadStatusStopped
		} else {
			status = discovery.ThreadStatusFailed
		}
	}
	if active.state != nil {
		if _, err := active.state.finalize(context.Background(), status); err != nil && streamErr == nil {
			streamErr = err
		}
	}

	done <- streamErr
}

func (s *Service) processEvent(ctx context.Context, state *streamPersistence, event StreamEvent) {
	if state == nil {
		return
	}
	switch event.Type {
	case "thread.started":
		_ = state.recordThreadExternal(ctx, event.ThreadID)
	case "item.started", "item.updated", "item.completed":
		if event.Item != nil {
			state.storeAgentItem(ctx, event.Item)
		}
	case "turn.completed":
		state.recordStatus(discovery.ThreadStatusCompleted)
		state.recordUsage(event.Usage)
	case "turn.failed":
		state.recordStatus(discovery.ThreadStatusFailed)
		state.recordUsage(event.Usage)
		if event.Error != nil {
			state.recordError(event.Error.Message)
		} else if strings.TrimSpace(event.Message) != "" {
			state.recordError(event.Message)
		}
	case "error":
		state.recordStatus(discovery.ThreadStatusFailed)
		state.recordUsage(event.Usage)
		if event.Error != nil {
			state.recordError(event.Error.Message)
		} else if strings.TrimSpace(event.Message) != "" {
			state.recordError(event.Message)
		}
	}

	if strings.TrimSpace(event.Message) != "" {
		switch event.Type {
		case "turn.failed", "error", "turn.completed":
			// handled separately
		default:
			state.createSystemEntry(ctx, "info", event.Message, nil)
		}
	}
}

func (s *Service) unregisterActive(streamID string) {
	s.activeMu.Lock()
	delete(s.active, streamID)
	s.activeMu.Unlock()
}

// Cancel stops an active stream and returns the new thread status.
func (s *Service) Cancel(ctx context.Context, streamID string) (CancelResponse, error) {
	s.activeMu.Lock()
	active, ok := s.active[streamID]
	s.activeMu.Unlock()
	if !ok {
		return CancelResponse{}, fmt.Errorf("stream %s not found", streamID)
	}

	if active.cancel != nil {
		_ = active.cancel()
	}

	if active.state != nil {
		active.state.recordStatus(discovery.ThreadStatusStopped)
		thread, err := active.state.finalize(context.Background(), discovery.ThreadStatusStopped)
		if err != nil {
			return CancelResponse{}, err
		}
		return CancelResponse{ThreadID: thread.ID, Status: string(thread.Status)}, nil
	}

	return CancelResponse{ThreadID: active.threadID, Status: string(discovery.ThreadStatusStopped)}, nil
}

// ListThreads returns threads for a project.
func (s *Service) ListThreads(ctx context.Context, projectID int64) ([]ThreadDTO, error) {
	if err := s.ensureRepo(); err != nil {
		return nil, err
	}
	records, err := s.repo.ListThreadsByProject(ctx, projectID)
	if err != nil {
		return nil, err
	}
	dtos := make([]ThreadDTO, 0, len(records))
	for _, record := range records {
		dto := toThreadDTO(record)
		if summary := s.computeDiffSummary(ctx, record.WorktreePath); summary != nil {
			dto.DiffSummary = summary
		}
		dtos = append(dtos, dto)
	}
	return dtos, nil
}

// GetThread returns a single thread.
func (s *Service) GetThread(ctx context.Context, id int64) (ThreadDTO, error) {
	if err := s.ensureRepo(); err != nil {
		return ThreadDTO{}, err
	}
	record, err := s.repo.GetThread(ctx, id)
	if err != nil {
		return ThreadDTO{}, err
	}
	dto := toThreadDTO(record)
	if summary := s.computeDiffSummary(ctx, record.WorktreePath); summary != nil {
		dto.DiffSummary = summary
	}
	return dto, nil
}

// ListThreadDiffStats returns git diff statistics for a thread worktree.
func (s *Service) ListThreadDiffStats(ctx context.Context, threadID int64) ([]FileDiffStatDTO, error) {
	if err := s.ensureRepo(); err != nil {
		return nil, err
	}
	thread, err := s.repo.GetThread(ctx, threadID)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(thread.WorktreePath) == "" {
		return nil, fmt.Errorf("thread %d has no worktree", threadID)
	}
	return collectGitDiffStats(ctx, thread.WorktreePath)
}

func (s *Service) computeDiffSummary(ctx context.Context, worktreePath string) *DiffSummaryDTO {
	if strings.TrimSpace(worktreePath) == "" {
		return nil
	}
	stats, err := collectGitDiffStats(ctx, worktreePath)
	if err != nil {
		return nil
	}
	var added, removed int
	for _, stat := range stats {
		added += stat.Added
		removed += stat.Removed
	}
	if added == 0 && removed == 0 {
		return nil
	}
	return &DiffSummaryDTO{Added: added, Removed: removed}
}

// LoadThreadConversation returns the persisted transcript for a thread.
func (s *Service) LoadThreadConversation(ctx context.Context, threadID int64) ([]ConversationEntryDTO, error) {
	if err := s.ensureRepo(); err != nil {
		return nil, err
	}
	if _, err := s.repo.GetThread(ctx, threadID); err != nil {
		return nil, err
	}
	entries, err := s.repo.ListConversationEntries(ctx, threadID)
	if err != nil {
		return nil, err
	}
	dtos := make([]ConversationEntryDTO, 0, len(entries))
	for _, entry := range entries {
		dto, err := conversationEntryToDTO(entry)
		if err != nil {
			return nil, err
		}
		dtos = append(dtos, dto)
	}
	return dtos, nil
}

// RenameThread updates the title of a thread and returns the refreshed record.
func (s *Service) RenameThread(ctx context.Context, id int64, title string) (ThreadDTO, error) {
	if err := s.ensureRepo(); err != nil {
		return ThreadDTO{}, err
	}
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return ThreadDTO{}, errors.New("thread title is required")
	}
	if err := s.repo.UpdateThreadTitle(ctx, id, trimmed); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ThreadDTO{}, fmt.Errorf("thread %d not found", id)
		}
		return ThreadDTO{}, err
	}
	record, err := s.repo.GetThread(ctx, id)
	if err != nil {
		return ThreadDTO{}, err
	}
	return toThreadDTO(record), nil
}

// DeleteThread removes a thread and its persisted conversation.
func (s *Service) DeleteThread(ctx context.Context, id int64) error {
	if err := s.ensureRepo(); err != nil {
		return err
	}
	// Load thread to get worktree path before deleting
	thread, getErr := s.repo.GetThread(ctx, id)
	if getErr != nil {
		if errors.Is(getErr, sql.ErrNoRows) {
			return fmt.Errorf("thread %d not found", id)
		}
		return getErr
	}
	// Best-effort remove worktree (branch retained by design)
	if s.worktrees != nil && strings.TrimSpace(thread.WorktreePath) != "" {
		_ = s.worktrees.RemoveForThread(ctx, thread.WorktreePath)
	}
	if err := s.repo.DeleteThread(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return fmt.Errorf("thread %d not found", id)
		}
		return err
	}
	return nil
}

// StartWorktreeCleanup launches a periodic cleanup goroutine that removes
// worktree directories whose threads no longer exist. Interval defaults to 1h
// if zero or negative.
func (s *Service) StartWorktreeCleanup(interval time.Duration) {
	if s.worktrees == nil {
		return
	}
	if interval <= 0 {
		interval = time.Hour
	}
	if s.cleanupStop != nil {
		return // already running
	}
	stop := make(chan struct{})
	s.cleanupStop = stop
	ticker := time.NewTicker(interval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				_ = s.cleanupOrphanWorktrees(context.Background())
			case <-stop:
				return
			}
		}
	}()
}

// StopWorktreeCleanup stops the background cleanup worker if running.
func (s *Service) StopWorktreeCleanup() {
	if s.cleanupStop != nil {
		close(s.cleanupStop)
		s.cleanupStop = nil
	}
}

func (s *Service) isThreadActive(threadID int64) bool {
	s.activeMu.Lock()
	defer s.activeMu.Unlock()
	for _, a := range s.active {
		if a.threadID == threadID {
			return true
		}
	}
	return false
}

func (s *Service) cleanupOrphanWorktrees(ctx context.Context) error {
	root := strings.TrimSpace(s.worktrees.Root())
	if root == "" {
		return nil
	}
	projectDirs, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	for _, pd := range projectDirs {
		if !pd.IsDir() {
			continue
		}
		projectPath := filepath.Join(root, pd.Name())
		threadDirs, err := os.ReadDir(projectPath)
		if err != nil {
			continue
		}
		for _, td := range threadDirs {
			if !td.IsDir() {
				continue
			}
			// parse numeric id
			id, perr := strconv.ParseInt(td.Name(), 10, 64)
			if perr != nil || id <= 0 {
				continue
			}
			if s.isThreadActive(id) {
				continue
			}
			// Does thread exist?
			if _, err := s.repo.GetThread(ctx, id); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					// orphan → remove worktree
					_ = s.worktrees.RemoveForThread(ctx, filepath.Join(projectPath, td.Name()))
				}
			}
		}
	}
	return nil
}
