package agents

import (
    "context"
    "fmt"
    "strings"

    "codex-ui/internal/storage/discovery"
    "codex-ui/internal/watchers"
    "codex-ui/internal/logging"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// API exposes agent operations to the frontend and emits runtime events.
type API struct {
    svc   *Service
    repo  *discovery.Repository
    watch *watchers.Service
    ctxFn func() context.Context
    log   logging.Logger
}

func NewAPI(svc *Service, repo *discovery.Repository, watch *watchers.Service, ctxProvider func() context.Context, logger logging.Logger) *API {
    if logger == nil { logger = logging.Nop() }
    return &API{svc: svc, repo: repo, watch: watch, ctxFn: ctxProvider, log: logger}
}

// Send streams a prompt through the configured agent and emits runtime events.
func (a *API) Send(req MessageRequest) (StreamHandle, error) {
	if a.svc == nil {
		return StreamHandle{}, fmt.Errorf("agent service not initialised")
	}
	if a.ctxFn == nil {
		return StreamHandle{}, fmt.Errorf("application context not initialised")
	}
	ctx := a.ctxFn()
	if ctx == nil {
		return StreamHandle{}, fmt.Errorf("application context not initialised")
	}
	stream, thread, err := a.svc.Send(context.Background(), req)
	if err != nil {
		return StreamHandle{}, err
	}
	if a.watch != nil {
		a.watch.Ensure(thread.ID, thread.WorktreePath)
	}
	go a.emitDiff(thread.ID)
	topic := StreamTopic(stream.ID())
	go func() {
		defer stream.Close()
		for event := range stream.Events() {
			if event.Item != nil && len(event.Item.FileDiffs) > 0 {
				go a.emitDiff(thread.ID)
			}
			wailsruntime.EventsEmit(ctx, topic, event)
		}
		finalEvent := StreamEvent{Type: "stream.complete"}
		if err := stream.Wait(); err != nil {
			finalEvent.Type = "stream.error"
			finalEvent.Error = &StreamError{Message: err.Error()}
		} else {
			if updated, err := a.svc.GetThread(context.Background(), thread.ID); err == nil {
				finalEvent.Message = updated.Status
			}
		}
		wailsruntime.EventsEmit(ctx, topic, finalEvent)
	}()
	return StreamHandle{StreamID: stream.ID(), ThreadID: thread.ID, ThreadExternalID: thread.ExternalID}, nil
}

func (a *API) Cancel(streamID string) (CancelResponse, error) {
	return a.svc.Cancel(context.Background(), streamID)
}
func (a *API) ListThreads(projectID int64) ([]ThreadDTO, error) {
	return a.svc.ListThreads(context.Background(), projectID)
}
func (a *API) GetThread(threadID int64) (ThreadDTO, error) {
	return a.svc.GetThread(context.Background(), threadID)
}
func (a *API) LoadThreadConversation(threadID int64) ([]ConversationEntryDTO, error) {
	return a.svc.LoadThreadConversation(context.Background(), threadID)
}
func (a *API) RenameThread(threadID int64, title string) (ThreadDTO, error) {
	return a.svc.RenameThread(context.Background(), threadID, title)
}
func (a *API) DeleteThread(threadID int64) error {
	if a.watch != nil {
		a.watch.Remove(threadID)
	}
	return a.svc.DeleteThread(context.Background(), threadID)
}

// ListThreadFileDiffs returns git diff stats and ensures watcher is attached.
func (a *API) ListThreadFileDiffs(threadID int64) ([]FileDiffStatDTO, error) {
	th, err := a.svc.GetThread(context.Background(), threadID)
	if err != nil {
		return nil, err
	}
	if a.watch != nil {
		a.watch.Ensure(th.ID, th.WorktreePath)
	}
	return a.svc.ListThreadDiffStats(context.Background(), threadID)
}

// CreatePullRequest commits pending changes, pushes a branch, and creates a GitHub PR.
// Returns the PR URL. If a PR already exists and is stored, returns it without changes.
func (a *API) CreatePullRequest(threadID int64) (string, error) {
	if a.svc == nil {
		return "", fmt.Errorf("agent service not initialised")
	}
	thread, err := a.svc.GetThread(context.Background(), threadID)
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(thread.PRURL) != "" {
		return thread.PRURL, nil
	}
	worktree := strings.TrimSpace(thread.WorktreePath)
	if worktree == "" {
		return "", fmt.Errorf("thread %d has no worktree", threadID)
	}
	diffs, err := a.svc.ListThreadDiffStats(context.Background(), threadID)
	if err != nil {
		return "", err
	}
	if len(diffs) == 0 {
		return "", fmt.Errorf("no file changes detected")
	}
    instruction := BuildCreatePRInstruction(thread.BranchName)
    stream, err := StartBackgroundPRStream(worktree, "danger-full-access", instruction)
	if err != nil {
		return "", err
	}
	if stream.Close != nil {
		defer stream.Close()
	}
	var prURL string
	for evt := range stream.Events {
		if url := ExtractPRURLFromEvent(evt); url != "" {
			prURL = url
		}
	}
	if stream.Done != nil {
		if waitErr, ok := <-stream.Done; ok && waitErr != nil {
			return "", waitErr
		}
	}
	if strings.TrimSpace(prURL) == "" {
		return "", fmt.Errorf("failed to detect PR URL from agent run")
	}
	if err := a.repo.UpdateThreadPRURL(context.Background(), thread.ID, prURL); err != nil {
		return "", err
	}
	a.emitDiff(thread.ID)
	return prURL, nil
}

func (a *API) emitDiff(threadID int64) {
	if a.svc == nil || a.ctxFn == nil {
		return
	}
	stats, err := a.svc.ListThreadDiffStats(context.Background(), threadID)
    if err != nil {
        if a.log != nil { a.log.Warn("list thread diff stats failed", "threadID", threadID, "error", err) }
        return
    }
	payload := struct {
		ThreadID int64             `json:"threadId"`
		Files    []FileDiffStatDTO `json:"files"`
	}{ThreadID: threadID, Files: stats}
	ctx := a.ctxFn()
	if ctx == nil {
		return
	}
	wailsruntime.EventsEmit(ctx, FileChangeTopic(threadID), payload)
}

// EmitThreadDiffUpdate recomputes and emits file diff update for a thread.
func (a *API) EmitThreadDiffUpdate(threadID int64) { a.emitDiff(threadID) }

// pr stream type moved to prs.go
