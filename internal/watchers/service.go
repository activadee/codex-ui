package watchers

import (
    "os"
    "path/filepath"
    "strings"
    "sync"
    "time"

    "github.com/fsnotify/fsnotify"
    "codex-ui/internal/logging"
)

// Service watches worktrees per thread and emits file diff updates.
type Service struct {
    mu           sync.Mutex
    watchers     map[int64]*fsnotify.Watcher
    notifyTimers map[int64]*time.Timer
    onDiff       func(threadID int64)
    logger       logging.Logger
    debounce     time.Duration
}

func New(emitter func(threadID int64)) *Service {
    return &Service{watchers: map[int64]*fsnotify.Watcher{}, notifyTimers: map[int64]*time.Timer{}, onDiff: emitter, logger: logging.Nop(), debounce: 200 * time.Millisecond}
}

func (s *Service) SetEmitter(fn func(threadID int64)) { s.mu.Lock(); s.onDiff = fn; s.mu.Unlock() }
func (s *Service) SetLogger(l logging.Logger)         { s.mu.Lock(); if l!=nil { s.logger = l } ; s.mu.Unlock() }
func (s *Service) SetDebounce(d time.Duration)        { s.mu.Lock(); if d>0 { s.debounce = d } ; s.mu.Unlock() }

func (s *Service) Ensure(threadID int64, worktree string) {
	worktree = strings.TrimSpace(worktree)
	if worktree == "" {
		return
	}
	s.mu.Lock()
	if w, ok := s.watchers[threadID]; ok {
		s.mu.Unlock()
        if err := w.Add(worktree); err != nil {
            // Log and attempt to recursively add in case root exists but subdirs do not
            s.logger.Warn("watcher add root failed", "threadID", threadID, "path", worktree, "error", err)
            if info, statErr := os.Stat(worktree); statErr == nil && info.IsDir() {
                _ = addRecursive(w, worktree)
            }
        }
        return
	}
    watcher, err := fsnotify.NewWatcher()
    if err != nil {
        s.mu.Unlock()
        s.logger.Error("watcher create failed", "threadID", threadID, "error", err)
        return
    }
    s.watchers[threadID] = watcher
    s.mu.Unlock()
    if err := addRecursive(watcher, worktree); err != nil {
        s.logger.Warn("watcher setup error", "threadID", threadID, "error", err)
    }
    go s.observe(threadID, watcher)
}

func (s *Service) Remove(threadID int64) {
	s.mu.Lock()
	if t, ok := s.notifyTimers[threadID]; ok {
		t.Stop()
		delete(s.notifyTimers, threadID)
	}
	w, ok := s.watchers[threadID]
	if ok {
		delete(s.watchers, threadID)
	}
	s.mu.Unlock()
	if ok {
		_ = w.Close()
	}
}

func (s *Service) Stop() {
	s.mu.Lock()
	timers := make([]*time.Timer, 0, len(s.notifyTimers))
	for _, t := range s.notifyTimers {
		timers = append(timers, t)
	}
	ws := make([]*fsnotify.Watcher, 0, len(s.watchers))
	for _, w := range s.watchers {
		ws = append(ws, w)
	}
	s.notifyTimers = map[int64]*time.Timer{}
	s.watchers = map[int64]*fsnotify.Watcher{}
	s.mu.Unlock()
	for _, t := range timers {
		if t != nil {
			t.Stop()
		}
	}
	for _, w := range ws {
		if w != nil {
			_ = w.Close()
		}
	}
}

func addRecursive(w *fsnotify.Watcher, root string) error {
    return filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
        if err != nil {
            return nil
        }
        if !d.IsDir() {
            return nil
        }
        if d.Name() == ".git" {
            return filepath.SkipDir
        }
        if err := w.Add(path); err != nil {
            // The caller logs context; keep errors quiet here.
        }
        return nil
    })
}

func (s *Service) observe(threadID int64, w *fsnotify.Watcher) {
	for {
		select {
		case ev, ok := <-w.Events:
			if !ok {
				return
			}
			if isIgnored(ev.Name) {
				continue
			}
			if ev.Op&fsnotify.Create != 0 {
				if info, err := os.Stat(ev.Name); err == nil && info.IsDir() {
					_ = addRecursive(w, ev.Name)
				}
			}
			s.schedule(threadID)
		case err, ok := <-w.Errors:
			if !ok {
				return
			}
            s.logger.Warn("watcher error", "threadID", threadID, "error", err)
        }
    }
}

func isIgnored(path string) bool {
    if path == "" {
        return false
    }
    // common VCS + caches + builds
    if strings.Contains(path, string(filepath.Separator)+".git"+string(filepath.Separator)) {
        return true
    }
    sep := string(filepath.Separator)
    if strings.Contains(path, sep+".codex"+sep) { return true }
    if strings.Contains(path, sep+"node_modules"+sep) { return true }
    if strings.Contains(path, sep+"dist"+sep) { return true }
    if strings.Contains(path, sep+"build"+sep) { return true }
    if strings.Contains(path, sep+".cache"+sep) { return true }
    // trailing folder matches
    base := filepath.Base(path)
    switch base {
    case ".git", ".codex", "node_modules", "dist", "build", ".cache":
        return true
    }
    return false
}

func (s *Service) schedule(threadID int64) {
	s.mu.Lock()
	if t, ok := s.notifyTimers[threadID]; ok {
		t.Stop()
	}
    var t *time.Timer
    delay := s.debounce
    if delay <= 0 { delay = 200 * time.Millisecond }
    t = time.AfterFunc(delay, func() {
        if s.onDiff != nil {
            s.onDiff(threadID)
        }
        s.mu.Lock()
        if cur, ok := s.notifyTimers[threadID]; ok && cur == t {
			delete(s.notifyTimers, threadID)
		}
		s.mu.Unlock()
	})
	s.notifyTimers[threadID] = t
	s.mu.Unlock()
}
