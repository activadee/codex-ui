-- +goose Up
ALTER TABLE threads ADD COLUMN IF NOT EXISTS branch_name TEXT;

-- +goose Down
-- No-op: keeping branch_name if present. Recreate table without column if needed.
SELECT 1;
