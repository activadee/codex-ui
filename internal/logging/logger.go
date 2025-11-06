package logging

import (
    "io"
    "log/slog"
    "os"
)

// Logger is a minimal structured logger facade over slog.
type Logger interface {
    Debug(msg string, args ...any)
    Info(msg string, args ...any)
    Warn(msg string, args ...any)
    Error(msg string, args ...any)
}

type slogLogger struct{ l *slog.Logger }

func (s *slogLogger) Debug(msg string, args ...any) { s.l.Debug(msg, args...) }
func (s *slogLogger) Info(msg string, args ...any)  { s.l.Info(msg, args...) }
func (s *slogLogger) Warn(msg string, args ...any)  { s.l.Warn(msg, args...) }
func (s *slogLogger) Error(msg string, args ...any) { s.l.Error(msg, args...) }

// NewText creates a text-handler logger writing to w with the given level.
func NewText(w io.Writer, level slog.Leveler) Logger {
    if w == nil {
        w = os.Stdout
    }
    h := slog.NewTextHandler(w, &slog.HandlerOptions{Level: level})
    return &slogLogger{l: slog.New(h)}
}

// NewJSON creates a json-handler logger writing to w with the given level.
func NewJSON(w io.Writer, level slog.Leveler) Logger {
    if w == nil {
        w = os.Stdout
    }
    h := slog.NewJSONHandler(w, &slog.HandlerOptions{Level: level})
    return &slogLogger{l: slog.New(h)}
}

// Nop returns a no-op logger.
func Nop() Logger { return nopLogger{} }

type nopLogger struct{}

func (nopLogger) Debug(string, ...any) {}
func (nopLogger) Info(string, ...any)  {}
func (nopLogger) Warn(string, ...any)  {}
func (nopLogger) Error(string, ...any) {}

