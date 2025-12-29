# Implementation Plan: MCP Server + RAG + Multi-User Integration

## Overview

Transform the existing Data Vault 2.1 dbt Agent into a full MCP-compatible server with RAG capabilities, persistent memory, and multi-user support for remote access from Claude Code clients.

**Server:** Linux at 10.0.0.25  
**Transport:** Streamable HTTP on port 3001  
**Clients:** Claude Code instances connecting remotely

---

## Phase 1: Dependencies

### Install Required Packages

```bash
cd /home/user/projects/datavault-dbt/agent
npm install @modelcontextprotocol/server express zod better-sqlite3 sqlite-vec ollama uuid
npm install -D @types/express @types/better-sqlite3 @types/uuid
```

### Package Purposes
| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/server` | MCP server SDK |
| `express` | HTTP server for Streamable HTTP transport |
| `zod` | Schema validation for tool inputs |
| `better-sqlite3` | SQLite database driver |
| `sqlite-vec` | Vector search extension for SQLite |
| `ollama` | Ollama client for embeddings |
| `uuid` | Session/user ID generation |

---

## Phase 2: MCP Server

### File: `agent/mcp-server.ts`

Create Express server with Streamable HTTP transport:

```typescript
// Structure outline:
// - Express app on port 3001
// - POST /mcp/v1/messages endpoint
// - Register all 15 existing tools in MCP format
// - Session management per user
// - Error handling and logging
```

### Tool Registration

Convert existing tools to MCP format:
1. `create_staging_model`
2. `create_hub`
3. `create_satellite`
4. `create_link`
5. `add_satellite_attribute`
6. `create_pit_view`
7. `create_mart_view`
8. `edit_model`
9. `run_dbt_command`
10. `analyze_dbt_error`
11. `undo_last_change`
12. `list_models`
13. `show_model_content`
14. `validate_model`
15. `get_project_status`

---

## Phase 3: Multi-User Authentication

### File: `agent/auth/tokens.ts`

Token-based authentication middleware:

```typescript
// Environment config (.env):
// MCP_USER_TOKENS=alice:token-abc123,bob:token-xyz789,admin:token-admin999

// Middleware:
// - Extract Bearer token from Authorization header
// - Lookup user_id from token map
// - Attach user_id to request context
// - Reject invalid tokens with 401
```

### Token Format
```env
MCP_USER_TOKENS=alice:token-abc123,bob:token-xyz789
```

### Request Flow
```
Client → Bearer Token → Middleware → user_id → Session → Tools
```

---

## Phase 4: SQLite Persistent Memory

### File: `agent/memory/schema.sql`

```sql
-- Users table
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Sessions table (per user, per connection)
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Message history
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL, -- 'user' | 'assistant' | 'tool'
    content TEXT NOT NULL,
    tool_name TEXT,
    tool_input TEXT,
    tool_output TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Data Vault objects tracking
CREATE TABLE dv_objects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    object_type TEXT NOT NULL, -- 'hub' | 'satellite' | 'link' | 'staging' | 'pit' | 'mart'
    object_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(object_type, object_name)
);

-- Deployment history
CREATE TABLE deployments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    session_id TEXT REFERENCES sessions(id),
    models TEXT NOT NULL, -- JSON array of model names
    status TEXT NOT NULL, -- 'success' | 'error' | 'partial'
    output TEXT,
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Undo stack
CREATE TABLE undo_stack (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL REFERENCES users(id),
    session_id TEXT REFERENCES sessions(id),
    action_type TEXT NOT NULL,
    object_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    previous_content TEXT,
    new_content TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Document chunks for RAG
CREATE TABLE doc_chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_file TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding BLOB, -- sqlite-vec vector
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_file, chunk_index)
);
```

### File: `agent/memory/database.ts`

```typescript
// Database wrapper:
// - Initialize SQLite with sqlite-vec extension
// - CRUD operations for all tables
// - Query helpers for RAG search
// - Transaction support for undo operations
```

---

## Phase 5: Ollama Setup

### File: `agent/scripts/setup-ollama.sh`

```bash
#!/bin/bash
# Install Ollama if not present
if ! command -v ollama &> /dev/null; then
    curl -fsSL https://ollama.ai/install.sh | sh
fi

# Pull embedding model
ollama pull nomic-embed-text

# Verify
ollama list
```

### Embedding Model
- **Model:** `nomic-embed-text`
- **Dimensions:** 768
- **Context:** 8192 tokens
- **Usage:** Document and query embedding

---

## Phase 6: RAG System

### File: `agent/memory/embeddings.ts`

```typescript
// Embedding functions:
// - embedText(text: string): Promise<number[]>
// - embedChunks(chunks: string[]): Promise<number[][]>
// - Uses Ollama client with nomic-embed-text
```

### File: `agent/memory/rag.ts`

```typescript
// RAG pipeline:
// - chunkDocument(content: string, chunkSize: number): string[]
// - indexDocument(filePath: string): Promise<void>
// - searchSimilar(query: string, topK: number): Promise<Chunk[]>
// - getContextForPrompt(query: string): Promise<string>
```

### Documents to Index
1. `LESSONS_LEARNED.md` - Project decisions and troubleshooting
2. `docs/SYSTEM.md` - System architecture
3. `docs/USER.md` - User guide
4. `docs/DEVELOPER.md` - Developer documentation
5. `docs/MODEL_ARCHITECTURE.md` - Data Vault model patterns
6. `.github/copilot-instructions.md` - Copilot rules
7. `.github/instructions/datavault-dbt.instructions.md` - Project instructions

### RAG Parameters
- **Chunk size:** 500 tokens
- **Chunk overlap:** 50 tokens
- **Top-K results:** 5
- **Similarity threshold:** 0.7

---

## Phase 7: Systemd Service

### File: `agent/scripts/datavault-agent.service`

```ini
[Unit]
Description=Data Vault dbt Agent MCP Server
After=network.target

[Service]
Type=simple
User=user
WorkingDirectory=/home/user/projects/datavault-dbt/agent
ExecStart=/usr/bin/node dist/mcp-server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

### Installation Commands
```bash
sudo cp agent/scripts/datavault-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable datavault-agent
sudo systemctl start datavault-agent
```

---

## Phase 8: Integration

### Enhanced System Prompt

Inject RAG context into system prompt:

```typescript
const ragContext = await getContextForPrompt(userQuery);
const systemPrompt = `
${baseSystemPrompt}

## Relevant Project Context
${ragContext}
`;
```

### Session Flow

```
1. Client connects with Bearer token
2. Middleware validates token → user_id
3. Create/resume session for user
4. Load conversation history from SQLite
5. Index any new/modified docs
6. Process request with RAG context
7. Execute tools with user isolation
8. Store results in SQLite
9. Return response
```

---

## File Structure

```
agent/
├── mcp-server.ts          # Main MCP server (Express + HTTP transport)
├── auth/
│   └── tokens.ts          # Token validation middleware
├── memory/
│   ├── database.ts        # SQLite wrapper
│   ├── schema.sql         # Database schema
│   ├── embeddings.ts      # Ollama embedding functions
│   └── rag.ts             # RAG pipeline
├── scripts/
│   ├── setup-ollama.sh    # Ollama installation
│   └── datavault-agent.service  # Systemd unit
└── data/
    └── agent.db           # SQLite database file
```

---

## Configuration

### Environment Variables (`.env`)

```env
# MCP Server
MCP_PORT=3001
MCP_HOST=0.0.0.0

# Multi-User Tokens
MCP_USER_TOKENS=alice:token-abc123,bob:token-xyz789

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# Database
SQLITE_PATH=./data/agent.db

# RAG
RAG_CHUNK_SIZE=500
RAG_CHUNK_OVERLAP=50
RAG_TOP_K=5
```

---

## Testing Plan

### Unit Tests
- [ ] Token validation middleware
- [ ] SQLite CRUD operations
- [ ] Embedding generation
- [ ] Chunk splitting
- [ ] Vector similarity search

### Integration Tests
- [ ] MCP tool registration
- [ ] End-to-end tool execution
- [ ] Multi-user session isolation
- [ ] RAG context injection

### Manual Tests
- [ ] Claude Code connection from client machine
- [ ] Create hub via MCP
- [ ] Deploy model via MCP
- [ ] Verify user isolation

---

## Implementation Order

1. **Dependencies** - Install all npm packages
2. **SQLite Schema** - Create database and tables
3. **Database Wrapper** - Implement CRUD operations
4. **Token Auth** - Middleware for user validation
5. **MCP Server** - Express server with tool registration
6. **Ollama Setup** - Install and configure embedding model
7. **Embeddings** - Ollama client integration
8. **RAG Pipeline** - Document indexing and search
9. **Systemd Service** - Auto-start configuration
10. **Testing** - Validate all components

---

## Notes

- No HTTPS needed (local network at 10.0.0.25)
- Each user gets isolated sessions and history
- Undo operations are user-scoped
- RAG context is shared across all users (project docs)
- Deployment history tracked per user
