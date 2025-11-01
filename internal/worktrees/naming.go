package worktrees

import (
    "fmt"
    "regexp"
    "strconv"
    "strings"
)

var branchSanitizer = regexp.MustCompile(`[^a-zA-Z0-9._-]+`)

// Slug produces a safe, lowercase segment suitable for git branch path components
// and directory names. Falls back to "thread" when empty after sanitization.
func Slug(s string) string {
    s = strings.TrimSpace(s)
    if s == "" {
        return "thread"
    }
    s = branchSanitizer.ReplaceAllString(s, "-")
    s = strings.Trim(s, "-._")
    if s == "" {
        return "thread"
    }
    return strings.ToLower(s)
}

// BranchName constructs a descriptive branch name using the provided title and id.
// Example: codex/refactor-auth-123
func BranchName(title string, id int64) string {
    slug := Slug(title)
    return fmt.Sprintf("codex/%s-%s", slug, strconv.FormatInt(id, 10))
}

// DirSuffix returns a descriptive directory segment for worktree paths.
// Example: refactor-auth-123
func DirSuffix(title string, id int64) string {
    slug := Slug(title)
    return fmt.Sprintf("%s-%s", slug, strconv.FormatInt(id, 10))
}

