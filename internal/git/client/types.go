package client

// FileDiffStat is a minimal representation of file-level changes.
type FileDiffStat struct {
    Path    string
    Added   int
    Removed int
    Status  string // porcelain-like code (e.g., M, A, ??)
}

