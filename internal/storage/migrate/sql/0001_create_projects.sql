-- +goose Up
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    display_name TEXT,
    tags TEXT,
    last_opened_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_projects_last_opened ON projects (last_opened_at DESC);

-- +goose Down
DROP TABLE IF EXISTS projects;

