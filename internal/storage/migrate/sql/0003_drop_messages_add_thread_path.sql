-- +goose Up
ALTER TABLE threads ADD COLUMN conversation_path TEXT;

DROP TABLE IF EXISTS messages;

CREATE TABLE IF NOT EXISTS thread_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    entry_type TEXT NOT NULL,
    payload TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_thread_entries_thread ON thread_entries(thread_id, created_at, id);

-- +goose Down
PRAGMA foreign_keys=OFF;

CREATE TABLE threads_backup (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    external_id TEXT,
    title TEXT NOT NULL,
    model TEXT NOT NULL,
    sandbox_mode TEXT NOT NULL DEFAULT '',
    reasoning_level TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO threads_backup (
    id,
    project_id,
    external_id,
    title,
    model,
    sandbox_mode,
    reasoning_level,
    status,
    created_at,
    updated_at,
    last_message_at
) SELECT
    id,
    project_id,
    external_id,
    title,
    model,
    sandbox_mode,
    reasoning_level,
    status,
    created_at,
    updated_at,
    last_message_at
FROM threads;

DROP TABLE threads;
ALTER TABLE threads_backup RENAME TO threads;

CREATE INDEX IF NOT EXISTS idx_threads_project_id ON threads(project_id);

PRAGMA foreign_keys=ON;

CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    role TEXT NOT NULL,
    item_type TEXT NOT NULL,
    content TEXT NOT NULL,
    metadata TEXT,
    position INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_id ON messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread_position ON messages(thread_id, position);

DROP TABLE IF EXISTS thread_entries;
