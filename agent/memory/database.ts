/**
 * SQLite Database Wrapper for Data Vault dbt Agent
 * Handles persistent storage for sessions, messages, objects, and RAG chunks
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Types
export interface User {
  id: string;
  name: string;
  token_hash?: string;
  created_at: string;
  last_seen: string;
}

export interface Session {
  id: string;
  user_id: string;
  client_info?: string;
  created_at: string;
  last_activity: string;
}

export interface Message {
  id?: number;
  session_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_name?: string;
  tool_input?: string;
  tool_output?: string;
  tokens_used?: number;
  created_at?: string;
}

export interface DvObject {
  id?: number;
  user_id: string;
  object_type: 'hub' | 'satellite' | 'link' | 'staging' | 'pit' | 'mart' | 'source';
  object_name: string;
  file_path: string;
  entity_name?: string;
  metadata?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Deployment {
  id?: number;
  user_id: string;
  session_id?: string;
  models: string[];
  target?: string;
  status: 'success' | 'error' | 'partial' | 'running';
  output?: string;
  error_message?: string;
  duration_ms?: number;
  created_at?: string;
}

export interface UndoEntry {
  id?: number;
  user_id: string;
  session_id?: string;
  action_type: 'create' | 'edit' | 'delete';
  object_type?: string;
  object_name: string;
  file_path: string;
  previous_content?: string;
  new_content?: string;
  is_undone?: number;
  created_at?: string;
}

export interface DocChunk {
  id?: number;
  source_file: string;
  chunk_index: number;
  content: string;
  content_hash?: string;
  embedding?: Buffer;
  metadata?: string;
  created_at?: string;
  updated_at?: string;
}

export class AgentDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || process.env.SQLITE_PATH || './data/agent.db';
    
    // Ensure directory exists
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    
    this.initSchema();
  }

  private initSchema(): void {
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf-8');
      this.db.exec(schema);
    } else {
      console.warn('Schema file not found, using embedded schema');
      this.createEmbeddedSchema();
    }
  }

  private createEmbeddedSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        client_info TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_name TEXT,
        tool_input TEXT,
        tool_output TEXT,
        tokens_used INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS dv_objects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        object_type TEXT NOT NULL,
        object_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        entity_name TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(object_type, object_name)
      );
      
      CREATE TABLE IF NOT EXISTS deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        models TEXT NOT NULL,
        target TEXT,
        status TEXT NOT NULL,
        output TEXT,
        error_message TEXT,
        duration_ms INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS undo_stack (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
        action_type TEXT NOT NULL,
        object_type TEXT,
        object_name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        previous_content TEXT,
        new_content TEXT,
        is_undone INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE TABLE IF NOT EXISTS doc_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_file TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT,
        embedding BLOB,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(source_file, chunk_index)
      );
    `);
  }

  // ============== User Operations ==============

  getOrCreateUser(userId: string, name: string): User {
    const existing = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
    
    if (existing) {
      this.db.prepare('UPDATE users SET last_seen = CURRENT_TIMESTAMP WHERE id = ?').run(userId);
      return existing;
    }

    this.db.prepare('INSERT INTO users (id, name) VALUES (?, ?)').run(userId, name);
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User;
  }

  getUser(userId: string): User | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as User | undefined;
  }

  listUsers(): User[] {
    return this.db.prepare('SELECT * FROM users ORDER BY last_seen DESC').all() as User[];
  }

  // ============== Session Operations ==============

  createSession(userId: string, clientInfo?: string): Session {
    const sessionId = uuidv4();
    this.db.prepare('INSERT INTO sessions (id, user_id, client_info) VALUES (?, ?, ?)').run(sessionId, userId, clientInfo || null);
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session;
  }

  getSession(sessionId: string): Session | undefined {
    return this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId) as Session | undefined;
  }

  updateSessionActivity(sessionId: string): void {
    this.db.prepare('UPDATE sessions SET last_activity = CURRENT_TIMESTAMP WHERE id = ?').run(sessionId);
  }

  getUserSessions(userId: string, limit = 10): Session[] {
    return this.db.prepare(
      'SELECT * FROM sessions WHERE user_id = ? ORDER BY last_activity DESC LIMIT ?'
    ).all(userId, limit) as Session[];
  }

  // ============== Message Operations ==============

  addMessage(message: Omit<Message, 'id' | 'created_at'>): number {
    const result = this.db.prepare(`
      INSERT INTO messages (session_id, user_id, role, content, tool_name, tool_input, tool_output, tokens_used)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      message.session_id,
      message.user_id,
      message.role,
      message.content,
      message.tool_name || null,
      message.tool_input || null,
      message.tool_output || null,
      message.tokens_used || null
    );
    return result.lastInsertRowid as number;
  }

  getSessionMessages(sessionId: string, limit = 100): Message[] {
    return this.db.prepare(
      'SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC LIMIT ?'
    ).all(sessionId, limit) as Message[];
  }

  getRecentMessages(userId: string, limit = 50): Message[] {
    return this.db.prepare(
      'SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, limit) as Message[];
  }

  // ============== DV Object Operations ==============

  upsertDvObject(obj: Omit<DvObject, 'id' | 'created_at' | 'updated_at'>): number {
    const result = this.db.prepare(`
      INSERT INTO dv_objects (user_id, object_type, object_name, file_path, entity_name, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(object_type, object_name) DO UPDATE SET
        file_path = excluded.file_path,
        entity_name = excluded.entity_name,
        metadata = excluded.metadata,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      obj.user_id,
      obj.object_type,
      obj.object_name,
      obj.file_path,
      obj.entity_name || null,
      obj.metadata || null
    );
    return result.lastInsertRowid as number;
  }

  getDvObject(objectType: string, objectName: string): DvObject | undefined {
    return this.db.prepare(
      'SELECT * FROM dv_objects WHERE object_type = ? AND object_name = ?'
    ).get(objectType, objectName) as DvObject | undefined;
  }

  listDvObjects(objectType?: string): DvObject[] {
    if (objectType) {
      return this.db.prepare('SELECT * FROM dv_objects WHERE object_type = ? ORDER BY object_name').all(objectType) as DvObject[];
    }
    return this.db.prepare('SELECT * FROM dv_objects ORDER BY object_type, object_name').all() as DvObject[];
  }

  deleteDvObject(objectType: string, objectName: string): boolean {
    const result = this.db.prepare('DELETE FROM dv_objects WHERE object_type = ? AND object_name = ?').run(objectType, objectName);
    return result.changes > 0;
  }

  // ============== Deployment Operations ==============

  addDeployment(deployment: Omit<Deployment, 'id' | 'created_at'>): number {
    const result = this.db.prepare(`
      INSERT INTO deployments (user_id, session_id, models, target, status, output, error_message, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      deployment.user_id,
      deployment.session_id || null,
      JSON.stringify(deployment.models),
      deployment.target || null,
      deployment.status,
      deployment.output || null,
      deployment.error_message || null,
      deployment.duration_ms || null
    );
    return result.lastInsertRowid as number;
  }

  getRecentDeployments(userId: string, limit = 20): Deployment[] {
    const rows = this.db.prepare(
      'SELECT * FROM deployments WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
    ).all(userId, limit) as any[];
    
    return rows.map(row => ({
      ...row,
      models: JSON.parse(row.models)
    }));
  }

  updateDeploymentStatus(deploymentId: number, status: string, output?: string, errorMessage?: string, durationMs?: number): void {
    this.db.prepare(`
      UPDATE deployments SET status = ?, output = ?, error_message = ?, duration_ms = ?
      WHERE id = ?
    `).run(status, output || null, errorMessage || null, durationMs || null, deploymentId);
  }

  // ============== Undo Stack Operations ==============

  pushUndo(entry: Omit<UndoEntry, 'id' | 'created_at' | 'is_undone'>): number {
    const result = this.db.prepare(`
      INSERT INTO undo_stack (user_id, session_id, action_type, object_type, object_name, file_path, previous_content, new_content)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.user_id,
      entry.session_id || null,
      entry.action_type,
      entry.object_type || null,
      entry.object_name,
      entry.file_path,
      entry.previous_content || null,
      entry.new_content || null
    );
    return result.lastInsertRowid as number;
  }

  getLastUndoEntry(userId: string): UndoEntry | undefined {
    return this.db.prepare(
      'SELECT * FROM undo_stack WHERE user_id = ? AND is_undone = 0 ORDER BY id DESC LIMIT 1'
    ).get(userId) as UndoEntry | undefined;
  }

  markUndone(undoId: number): void {
    this.db.prepare('UPDATE undo_stack SET is_undone = 1 WHERE id = ?').run(undoId);
  }

  getUndoHistory(userId: string, limit = 20): UndoEntry[] {
    return this.db.prepare(
      'SELECT * FROM undo_stack WHERE user_id = ? ORDER BY id DESC LIMIT ?'
    ).all(userId, limit) as UndoEntry[];
  }

  // ============== Document Chunk Operations (RAG) ==============

  upsertDocChunk(chunk: Omit<DocChunk, 'id' | 'created_at' | 'updated_at'>): number {
    const result = this.db.prepare(`
      INSERT INTO doc_chunks (source_file, chunk_index, content, content_hash, embedding, metadata)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(source_file, chunk_index) DO UPDATE SET
        content = excluded.content,
        content_hash = excluded.content_hash,
        embedding = excluded.embedding,
        metadata = excluded.metadata,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      chunk.source_file,
      chunk.chunk_index,
      chunk.content,
      chunk.content_hash || null,
      chunk.embedding || null,
      chunk.metadata || null
    );
    return result.lastInsertRowid as number;
  }

  getDocChunks(sourceFile: string): DocChunk[] {
    return this.db.prepare(
      'SELECT * FROM doc_chunks WHERE source_file = ? ORDER BY chunk_index'
    ).all(sourceFile) as DocChunk[];
  }

  getAllChunksWithEmbeddings(): DocChunk[] {
    return this.db.prepare(
      'SELECT * FROM doc_chunks WHERE embedding IS NOT NULL'
    ).all() as DocChunk[];
  }

  deleteDocChunks(sourceFile: string): number {
    const result = this.db.prepare('DELETE FROM doc_chunks WHERE source_file = ?').run(sourceFile);
    return result.changes;
  }

  getChunksByHash(contentHash: string): DocChunk[] {
    return this.db.prepare(
      'SELECT * FROM doc_chunks WHERE content_hash = ?'
    ).all(contentHash) as DocChunk[];
  }

  // ============== Vector Search (Basic - without sqlite-vec) ==============
  
  /**
   * Basic cosine similarity search without sqlite-vec extension
   * For production, consider using sqlite-vec for better performance
   */
  searchSimilarChunks(queryEmbedding: number[], topK = 5): { chunk: DocChunk; similarity: number }[] {
    const allChunks = this.getAllChunksWithEmbeddings();
    
    const results: { chunk: DocChunk; similarity: number }[] = [];
    
    for (const chunk of allChunks) {
      if (!chunk.embedding) continue;
      
      // Convert Buffer to Float32Array
      const chunkEmbedding = new Float32Array(chunk.embedding.buffer, chunk.embedding.byteOffset, chunk.embedding.length / 4);
      
      // Cosine similarity
      const similarity = this.cosineSimilarity(queryEmbedding, Array.from(chunkEmbedding));
      results.push({ chunk, similarity });
    }
    
    // Sort by similarity descending and take top K
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  // ============== Utility Methods ==============

  close(): void {
    this.db.close();
  }

  getStats(): { users: number; sessions: number; messages: number; objects: number; deployments: number; chunks: number } {
    return {
      users: (this.db.prepare('SELECT COUNT(*) as count FROM users').get() as any).count,
      sessions: (this.db.prepare('SELECT COUNT(*) as count FROM sessions').get() as any).count,
      messages: (this.db.prepare('SELECT COUNT(*) as count FROM messages').get() as any).count,
      objects: (this.db.prepare('SELECT COUNT(*) as count FROM dv_objects').get() as any).count,
      deployments: (this.db.prepare('SELECT COUNT(*) as count FROM deployments').get() as any).count,
      chunks: (this.db.prepare('SELECT COUNT(*) as count FROM doc_chunks').get() as any).count,
    };
  }

  vacuum(): void {
    this.db.exec('VACUUM');
  }

  /**
   * Execute raw SQL statement (for admin operations)
   */
  execRaw(sql: string): void {
    this.db.exec(sql);
  }

  /**
   * Execute raw SQL query and return results
   */
  queryRaw<T = unknown>(sql: string): T[] {
    return this.db.prepare(sql).all() as T[];
  }

  /**
   * Clear all document chunks (for re-indexing)
   */
  clearAllChunks(): number {
    const result = this.db.prepare('DELETE FROM doc_chunks').run();
    return result.changes;
  }

  /**
   * Get chunk statistics grouped by source file
   */
  getChunkStats(): Array<{ source_file: string; chunks: number }> {
    return this.db.prepare(`
      SELECT source_file, COUNT(*) as chunks 
      FROM doc_chunks 
      GROUP BY source_file 
      ORDER BY source_file
    `).all() as Array<{ source_file: string; chunks: number }>;
  }
}

// Singleton instance
let dbInstance: AgentDatabase | null = null;

export function getDatabase(dbPath?: string): AgentDatabase {
  if (!dbInstance) {
    dbInstance = new AgentDatabase(dbPath);
  }
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}
