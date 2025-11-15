package godexsdk

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/activadee/godex"

	"codex-ui/internal/agents/connector"
)

type session struct {
	thread *godex.Thread
	evts   chan connector.Event
	caps   connector.CapabilitySet

	idMu sync.RWMutex
	id   string

	stateMu sync.Mutex
	running bool
	closed  bool
	current *godex.RunStreamedResult

	wg        sync.WaitGroup
	closeOnce sync.Once
}

func (s *session) Events() <-chan connector.Event {
	return s.evts
}

func (s *session) Capabilities() connector.CapabilitySet {
	return s.caps.Clone()
}

func (s *session) Send(ctx context.Context, prompts ...connector.Prompt) error {
	if len(prompts) == 0 {
		return errors.New("prompt is required")
	}
	if ctx == nil {
		ctx = context.Background()
	}

	segments, fallback, err := promptsToInputs(prompts)
	if err != nil {
		return err
	}
	if len(segments) == 0 && strings.TrimSpace(fallback) == "" {
		return errors.New("prompt has no content")
	}
	turnOpts, err := buildTurnOptions(prompts)
	if err != nil {
		return err
	}

	s.stateMu.Lock()
	if s.closed {
		s.stateMu.Unlock()
		return errors.New("session closed")
	}
	if s.running {
		s.stateMu.Unlock()
		return errors.New("turn in progress")
	}
	s.running = true
	s.stateMu.Unlock()

	var result godex.RunStreamedResult
	if len(segments) > 0 {
		result, err = s.thread.RunStreamedInputs(ctx, segments, turnOpts)
	} else {
		result, err = s.thread.RunStreamed(ctx, fallback, turnOpts)
	}
	if err != nil {
		s.stateMu.Lock()
		s.running = false
		s.stateMu.Unlock()
		return err
	}

	s.stateMu.Lock()
	if s.closed {
		s.running = false
		s.stateMu.Unlock()
		_ = result.Close()
		return errors.New("session closed")
	}
	current := result
	s.current = &current
	s.wg.Add(1)
	s.stateMu.Unlock()

	go s.consume(result)
	return nil
}

func (s *session) Close() error {
	s.closeOnce.Do(func() {
		s.stateMu.Lock()
		s.closed = true
		var current *godex.RunStreamedResult
		if s.current != nil {
			current = s.current
		}
		s.stateMu.Unlock()
		if current != nil {
			_ = current.Close()
		}
		s.wg.Wait()
		close(s.evts)
	})
	return nil
}

func (s *session) consume(result godex.RunStreamedResult) {
	defer s.wg.Done()
	defer func() {
		_ = result.Close()
		s.stateMu.Lock()
		s.running = false
		s.current = nil
		s.stateMu.Unlock()
	}()

	for event := range result.Events() {
		if started, ok := event.(godex.ThreadStartedEvent); ok {
			s.setThreadID(started.ThreadID)
		}
		converted := convertThreadEvent(event, s.threadID())
		if converted.Type == "" {
			continue
		}
		s.emit(converted)
	}

	if err := result.Wait(); err != nil {
		s.emit(connector.Event{
			Type:      connector.EventTypeSessionError,
			ThreadID:  s.threadID(),
			Timestamp: time.Now(),
			Message:   err.Error(),
			Error:     &connector.EventError{Message: err.Error()},
		})
	}
}

func (s *session) emit(evt connector.Event) {
	select {
	case s.evts <- evt:
	default:
		s.evts <- evt
	}
}

func (s *session) threadID() string {
	s.idMu.RLock()
	defer s.idMu.RUnlock()
	return s.id
}

func (s *session) setThreadID(id string) {
	if strings.TrimSpace(id) == "" {
		return
	}
	s.idMu.Lock()
	s.id = id
	s.idMu.Unlock()
}
