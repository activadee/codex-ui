package attachments

import (
    "encoding/base64"
    "fmt"
    "mime"
    "os"
    "path/filepath"
    "strings"

    "github.com/google/uuid"
    "codex-ui/internal/storage"
)

const attachmentsDirName = "attachments"

type API struct{}

func NewAPI() *API { return &API{} }

// SaveClipboardImage persists a clipboard image to disk and returns the absolute path.
func (a *API) SaveClipboardImage(dataBase64 string, mimeType string) (string, error) {
    encoded := strings.TrimSpace(dataBase64)
    if encoded == "" { return "", fmt.Errorf("image data is required") }
    mediaType := strings.TrimSpace(mimeType)
    if mediaType == "" { mediaType = "image/png" }
    if !strings.HasPrefix(mediaType, "image/") { return "", fmt.Errorf("unsupported mime type %q", mediaType) }
    bytes, err := base64.StdEncoding.DecodeString(encoded)
    if err != nil { return "", fmt.Errorf("decode image data: %w", err) }
    if len(bytes) == 0 { return "", fmt.Errorf("image data is empty") }
    ext := ".png"
    if candidates, err := mime.ExtensionsByType(mediaType); err == nil {
        for _, c := range candidates { if c!="" { ext = c; break } }
    } else if strings.Contains(mediaType, "jpeg") { ext = ".jpg" }
    dir, err := a.attachmentsDir(); if err != nil { return "", err }
    if err := os.MkdirAll(dir, 0o755); err != nil { return "", fmt.Errorf("create attachments directory: %w", err) }
    filename := uuid.NewString() + ext
    target := filepath.Join(dir, filename)
    if err := os.WriteFile(target, bytes, 0o600); err != nil { return "", fmt.Errorf("write image: %w", err) }
    abs, err := filepath.Abs(target); if err != nil { return "", fmt.Errorf("resolve image path: %w", err) }
    return abs, nil
}

// DeleteAttachment removes a previously saved attachment file.
func (a *API) DeleteAttachment(path string) error {
    trimmed := strings.TrimSpace(path)
    if trimmed == "" { return nil }
    target, err := filepath.Abs(trimmed); if err != nil { return fmt.Errorf("resolve attachment path: %w", err) }
    dir, err := a.attachmentsDir(); if err != nil { return err }
    rootAbs, err := filepath.Abs(dir); if err != nil { return fmt.Errorf("resolve attachments root: %w", err) }
    rel, err := filepath.Rel(rootAbs, target); if err != nil { return fmt.Errorf("resolve relative: %w", err) }
    if rel=="." || rel=="" || rel==".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) { return fmt.Errorf("attachment path outside managed directory") }
    if err := os.Remove(target); err != nil { return fmt.Errorf("delete attachment: %w", err) }
    return nil
}

func (a *API) attachmentsDir() (string, error) {
    root, err := storage.DataDir(); if err != nil { return "", err }
    return filepath.Join(root, attachmentsDirName), nil
}

