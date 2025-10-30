-- +goose Up
ALTER TABLE threads ADD COLUMN worktree_path TEXT;

-- +goose Down
-- No-op: keeping worktree_path if present. Recreate table without column if needed.
SELECT 1;
