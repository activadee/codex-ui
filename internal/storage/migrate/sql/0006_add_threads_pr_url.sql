-- +goose Up
ALTER TABLE threads ADD COLUMN IF NOT EXISTS pr_url TEXT;

-- +goose Down
-- No-op: keeping pr_url if present. Recreate table without column if needed.

