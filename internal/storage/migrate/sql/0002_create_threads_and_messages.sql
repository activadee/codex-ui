-- +goose Up
CREATE TABLE threads (
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

CREATE INDEX idx_threads_project_id ON threads(project_id);

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

CREATE INDEX idx_messages_thread_id ON messages(thread_id);
CREATE INDEX idx_messages_thread_position ON messages(thread_id, position);

-- +goose Down
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS threads;
