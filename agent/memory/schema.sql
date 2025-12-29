-- Data Vault dbt Agent - SQLite Schema
-- Persistent memory for MCP server with multi-user support

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    token_hash TEXT,  -- Optional: hashed token for validation
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (per user, per connection)
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_info TEXT,  -- Optional metadata about client
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message history
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool', 'system')),
    content TEXT NOT NULL,
    tool_name TEXT,
    tool_input TEXT,  -- JSON
    tool_output TEXT, -- JSON
    tokens_used INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Data Vault objects tracking
CREATE TABLE IF NOT EXISTS dv_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    object_type TEXT NOT NULL CHECK(object_type IN ('hub', 'satellite', 'link', 'staging', 'pit', 'mart', 'source')),
    object_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    entity_name TEXT,  -- The business entity (e.g., 'company', 'project')
    metadata TEXT,     -- JSON for additional info
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(object_type, object_name)
);

-- Deployment history
CREATE TABLE IF NOT EXISTS deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    models TEXT NOT NULL,  -- JSON array of model names
    target TEXT,           -- dbt target used (dev, werkportal, etc.)
    status TEXT NOT NULL CHECK(status IN ('success', 'error', 'partial', 'running')),
    output TEXT,
    error_message TEXT,
    duration_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Undo stack for reversible operations
CREATE TABLE IF NOT EXISTS undo_stack (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,  -- 'create', 'edit', 'delete'
    object_type TEXT,           -- 'hub', 'satellite', etc.
    object_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    previous_content TEXT,      -- Content before change (NULL for create)
    new_content TEXT,           -- Content after change (NULL for delete)
    is_undone INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Document chunks for RAG (vector search)
CREATE TABLE IF NOT EXISTS doc_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    content_hash TEXT,          -- For detecting changes
    embedding BLOB,             -- Float32 array (768 dims for nomic-embed-text)
    metadata TEXT,              -- JSON: section headers, line numbers, etc.
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_file, chunk_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_user ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_dv_objects_user ON dv_objects(user_id);
CREATE INDEX IF NOT EXISTS idx_dv_objects_type ON dv_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_deployments_user ON deployments(user_id);
CREATE INDEX IF NOT EXISTS idx_deployments_created ON deployments(created_at);
CREATE INDEX IF NOT EXISTS idx_undo_stack_user ON undo_stack(user_id);
CREATE INDEX IF NOT EXISTS idx_undo_stack_session ON undo_stack(session_id);
CREATE INDEX IF NOT EXISTS idx_doc_chunks_source ON doc_chunks(source_file);

-- Virtual table for full-text search on messages (optional)
-- CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(content, content='messages', content_rowid='id');
