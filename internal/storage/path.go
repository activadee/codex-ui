package storage

import (
    "fmt"
    "os"
    "path/filepath"
    "runtime"
)

// DataDir returns the directory to store application data.
// Mirrors common desktop app conventions:
// - Linux: $XDG_DATA_HOME or ~/.local/share/codex-ui
// - macOS: ~/Library/Application Support/codex-ui
// - Windows: %APPDATA%/codex-ui (fallbacks to UserConfigDir)
func DataDir() (string, error) {
    var dir string
    switch runtime.GOOS {
    case "darwin":
        home, err := os.UserHomeDir()
        if err != nil {
            return "", fmt.Errorf("resolve home directory: %w", err)
        }
        dir = filepath.Join(home, "Library", "Application Support", "codex-ui")
    case "windows":
        base := os.Getenv("APPDATA")
        if base == "" {
            var err error
            base, err = os.UserConfigDir()
            if err != nil {
                return "", fmt.Errorf("resolve config directory: %w", err)
            }
        }
        dir = filepath.Join(base, "codex-ui")
    default:
        base := os.Getenv("XDG_DATA_HOME")
        if base == "" {
            home, err := os.UserHomeDir()
            if err != nil {
                return "", fmt.Errorf("resolve home directory: %w", err)
            }
            base = filepath.Join(home, ".local", "share")
        }
        dir = filepath.Join(base, "codex-ui")
    }
    if err := os.MkdirAll(dir, 0o755); err != nil {
        return "", fmt.Errorf("ensure data directory: %w", err)
    }
    return dir, nil
}

