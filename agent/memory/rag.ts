/**
 * RAG (Retrieval-Augmented Generation) Pipeline
 * 
 * Indexes project documentation and provides relevant context
 * for AI-assisted Data Vault operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

// ES Module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getDatabase, DocChunk } from './database.js';
import {
  embedText,
  embedTexts,
  embeddingToBuffer,
  bufferToEmbedding,
  cosineSimilarity,
  checkOllamaHealth,
} from './embeddings.js';

// ============== Configuration ==============

const RAG_CHUNK_SIZE = parseInt(process.env.RAG_CHUNK_SIZE || '500', 10);
const RAG_CHUNK_OVERLAP = parseInt(process.env.RAG_CHUNK_OVERLAP || '50', 10);
const RAG_TOP_K = parseInt(process.env.RAG_TOP_K || '5', 10);
const RAG_SIMILARITY_THRESHOLD = parseFloat(process.env.RAG_SIMILARITY_THRESHOLD || '0.5');

// Project root (parent of agent directory)
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Documents to index for RAG - organized by category
const DOCUMENTS_TO_INDEX = [
  // === Documentation ===
  'LESSONS_LEARNED.md',
  'docs/SYSTEM.md',
  'docs/USER.md',
  'docs/DEVELOPER.md',
  'docs/MODEL_ARCHITECTURE.md',
  'docs/MCP_SERVER.md',
  'docs/RAG_SYSTEM.md',
  
  // === Instructions & Prompts ===
  '.github/copilot-instructions.md',
  '.github/instructions/datavault-dbt.instructions.md',
  
  // === dbt Configuration ===
  'dbt_project.yml',
  
  // === Macros (SQL Templates) ===
  'macros/generate_schema_name.sql',
  'macros/hash_override.sql',
  'macros/satellite_current_flag.sql',
  'macros/ghost_records.sql',
  'macros/cleanup_old_objects.sql',
  
  // === Staging Layer ===
  'models/staging/sources.yml',
  'models/staging/stg_company.sql',
  'models/staging/stg_country.sql',
  'models/staging/stg_project.sql',
  
  // === Raw Vault - Hubs ===
  'models/raw_vault/hubs/hub_company.sql',
  'models/raw_vault/hubs/hub_country.sql',
  'models/raw_vault/hubs/hub_project.sql',
  
  // === Raw Vault - Satellites ===
  'models/raw_vault/satellites/sat_company.sql',
  'models/raw_vault/satellites/sat_company_client_ext.sql',
  'models/raw_vault/satellites/sat_country.sql',
  'models/raw_vault/satellites/sat_project.sql',
  'models/raw_vault/satellites/eff_sat_company_country.sql',
  
  // === Raw Vault - Links ===
  'models/raw_vault/links/link_company_country.sql',
  'models/raw_vault/links/link_company_role.sql',
  
  // === Business Vault ===
  'models/business_vault/pit_company.sql',
  
  // === Marts ===
  'models/mart/v_company_current.sql',
  'models/mart/v_company_top3.sql',
  'models/mart/v_countries.sql',
  'models/mart/customer/v_top10_customers.sql',
  'models/mart/project/company_current_v.sql',
  'models/mart/reference/v_country_names.sql',
  'models/mart/reporting/v_company_top5.sql',
  
  // === Schema Definitions ===
  'models/schema.yml',
  'seeds/schema.yml',
  
  // === Scripts ===
  'scripts/setup_werkportal_prod.sql',
  
  // === Agent Documentation ===
  'agent/README.md',
];

// ============== Types ==============

export interface ChunkMetadata {
  section?: string;
  lineStart?: number;
  lineEnd?: number;
  headers?: string[];
}

export interface SearchResult {
  content: string;
  sourceFile: string;
  chunkIndex: number;
  similarity: number;
  metadata?: ChunkMetadata;
}

// ============== Text Processing ==============

/**
 * Split text into chunks with overlap
 */
export function chunkText(
  text: string,
  chunkSize = RAG_CHUNK_SIZE,
  overlap = RAG_CHUNK_OVERLAP
): string[] {
  // Split by paragraphs first, then by sentences if needed
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds chunk size
    if (currentChunk.length + paragraph.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Keep overlap from end of current chunk
      const words = currentChunk.split(/\s+/);
      const overlapWords = words.slice(-Math.floor(overlap / 5)); // Approximate words for overlap
      currentChunk = overlapWords.join(' ') + '\n\n' + paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Extract metadata from markdown content
 */
function extractMetadata(content: string, fullContent: string): ChunkMetadata {
  const metadata: ChunkMetadata = {};

  // Find headers in the content
  const headerMatches = content.match(/^#{1,6}\s+.+$/gm);
  if (headerMatches) {
    metadata.headers = headerMatches.map(h => h.replace(/^#+\s+/, ''));
  }

  // Find section from context
  const contentStart = fullContent.indexOf(content);
  if (contentStart > 0) {
    const beforeContent = fullContent.slice(0, contentStart);
    const lastHeader = beforeContent.match(/^#{1,6}\s+.+$/gm)?.pop();
    if (lastHeader) {
      metadata.section = lastHeader.replace(/^#+\s+/, '');
    }
  }

  return metadata;
}

/**
 * Calculate content hash for change detection
 */
function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

// ============== Document Indexing ==============

/**
 * Index a single document
 */
export async function indexDocument(filePath: string): Promise<{
  chunksIndexed: number;
  skipped: boolean;
}> {
  const absolutePath = path.isAbsolute(filePath) 
    ? filePath 
    : path.join(PROJECT_ROOT, filePath);

  if (!fs.existsSync(absolutePath)) {
    console.warn(`⚠️  Document not found: ${filePath}`);
    return { chunksIndexed: 0, skipped: true };
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const contentHash = hashContent(content);

  const db = getDatabase();
  
  // Check if already indexed with same content
  const existingChunks = db.getDocChunks(filePath);
  if (existingChunks.length > 0 && existingChunks[0].content_hash === contentHash) {
    console.log(`⏭️  Skipping (unchanged): ${filePath}`);
    return { chunksIndexed: existingChunks.length, skipped: true };
  }

  // Delete old chunks if content changed
  if (existingChunks.length > 0) {
    db.deleteDocChunks(filePath);
    console.log(`🔄 Re-indexing (content changed): ${filePath}`);
  }

  // Chunk the content
  const chunks = chunkText(content);
  console.log(`📄 Indexing ${filePath}: ${chunks.length} chunks`);

  // Generate embeddings for all chunks
  const { embeddings } = await embedTexts(chunks);

  // Store chunks with embeddings
  for (let i = 0; i < chunks.length; i++) {
    const metadata = extractMetadata(chunks[i], content);
    
    db.upsertDocChunk({
      source_file: filePath,
      chunk_index: i,
      content: chunks[i],
      content_hash: i === 0 ? contentHash : undefined, // Store hash only in first chunk
      embedding: embeddingToBuffer(embeddings[i]),
      metadata: JSON.stringify(metadata),
    });
  }

  return { chunksIndexed: chunks.length, skipped: false };
}

/**
 * Index all configured documents
 */
export async function indexAllDocuments(): Promise<{
  totalChunks: number;
  documentsIndexed: number;
  documentsSkipped: number;
}> {
  // Check Ollama health first
  const health = await checkOllamaHealth();
  if (!health.available) {
    throw new Error(`Ollama not available: ${health.error}`);
  }
  if (!health.modelLoaded) {
    throw new Error(health.error || 'Embedding model not loaded');
  }

  let totalChunks = 0;
  let documentsIndexed = 0;
  let documentsSkipped = 0;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('  RAG Document Indexing');
  console.log('═══════════════════════════════════════════════════════════');

  for (const doc of DOCUMENTS_TO_INDEX) {
    try {
      const result = await indexDocument(doc);
      totalChunks += result.chunksIndexed;
      if (result.skipped) {
        documentsSkipped++;
      } else {
        documentsIndexed++;
      }
    } catch (error) {
      console.error(`❌ Failed to index ${doc}:`, error);
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  ✓ Indexed: ${documentsIndexed}, Skipped: ${documentsSkipped}`);
  console.log(`  ✓ Total chunks: ${totalChunks}`);
  console.log('═══════════════════════════════════════════════════════════');

  return { totalChunks, documentsIndexed, documentsSkipped };
}

// ============== Similarity Search ==============

/**
 * Search for similar chunks based on a query
 */
export async function searchSimilar(
  query: string,
  topK = RAG_TOP_K,
  threshold = RAG_SIMILARITY_THRESHOLD
): Promise<SearchResult[]> {
  // Generate query embedding
  const { embedding: queryEmbedding } = await embedText(query);

  // Get all chunks with embeddings from database
  const db = getDatabase();
  const allChunks = db.getAllChunksWithEmbeddings();

  if (allChunks.length === 0) {
    console.warn('⚠️  No indexed documents found. Run indexAllDocuments() first.');
    return [];
  }

  // Calculate similarities
  const results: SearchResult[] = [];

  for (const chunk of allChunks) {
    if (!chunk.embedding) continue;

    const chunkEmbedding = bufferToEmbedding(chunk.embedding);
    const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);

    if (similarity >= threshold) {
      results.push({
        content: chunk.content,
        sourceFile: chunk.source_file,
        chunkIndex: chunk.chunk_index,
        similarity,
        metadata: chunk.metadata ? JSON.parse(chunk.metadata) : undefined,
      });
    }
  }

  // Sort by similarity and take top K
  results.sort((a, b) => b.similarity - a.similarity);
  return results.slice(0, topK);
}

/**
 * Get relevant context for a user prompt
 * Returns formatted context string to inject into system prompt
 */
export async function getContextForPrompt(
  userQuery: string,
  topK = RAG_TOP_K
): Promise<string> {
  try {
    const results = await searchSimilar(userQuery, topK);

    if (results.length === 0) {
      return '';
    }

    // Format results as context
    const contextParts: string[] = [];

    for (const result of results) {
      const source = path.basename(result.sourceFile);
      const section = result.metadata?.section ? ` (${result.metadata.section})` : '';
      const similarity = (result.similarity * 100).toFixed(0);

      contextParts.push(
        `### From ${source}${section} [${similarity}% relevant]\n\n${result.content}`
      );
    }

    return contextParts.join('\n\n---\n\n');
  } catch (error) {
    console.error('RAG search error:', error);
    return '';
  }
}

// ============== Index Management ==============

/**
 * Get indexing statistics
 */
export function getIndexStats(): {
  totalChunks: number;
  documentsIndexed: string[];
  chunksPerDocument: Record<string, number>;
} {
  const db = getDatabase();
  const allChunks = db.getAllChunksWithEmbeddings();

  const chunksPerDocument: Record<string, number> = {};
  const documentsIndexed = new Set<string>();

  for (const chunk of allChunks) {
    documentsIndexed.add(chunk.source_file);
    chunksPerDocument[chunk.source_file] = (chunksPerDocument[chunk.source_file] || 0) + 1;
  }

  return {
    totalChunks: allChunks.length,
    documentsIndexed: Array.from(documentsIndexed),
    chunksPerDocument,
  };
}

/**
 * Get detailed indexing statistics for CLI display
 */
export async function getIndexStatsDetailed(): Promise<{
  documentsCount: number;
  chunksCount: number;
  avgChunksPerDoc: number;
  documents: Array<{ source_file: string; chunks: number }>;
}> {
  const db = getDatabase();
  
  // Use the new public method
  const rows = db.getChunkStats();
  const chunksCount = rows.reduce((sum, r) => sum + r.chunks, 0);
  
  return {
    documentsCount: rows.length,
    chunksCount,
    avgChunksPerDoc: rows.length > 0 ? chunksCount / rows.length : 0,
    documents: rows,
  };
}

/**
 * Clear all indexed documents
 */
export function clearIndex(): number {
  const db = getDatabase();
  let deleted = 0;

  for (const doc of DOCUMENTS_TO_INDEX) {
    deleted += db.deleteDocChunks(doc);
  }

  return deleted;
}

/**
 * Force re-index all documents
 */
export async function reindexAll(): Promise<{
  totalChunks: number;
  documentsIndexed: number;
}> {
  clearIndex();
  
  const result = await indexAllDocuments();
  return {
    totalChunks: result.totalChunks,
    documentsIndexed: result.documentsIndexed + result.documentsSkipped,
  };
}

// ============== Export Configuration ==============

export function getRAGConfig(): {
  chunkSize: number;
  chunkOverlap: number;
  topK: number;
  similarityThreshold: number;
  documentsToIndex: string[];
} {
  return {
    chunkSize: RAG_CHUNK_SIZE,
    chunkOverlap: RAG_CHUNK_OVERLAP,
    topK: RAG_TOP_K,
    similarityThreshold: RAG_SIMILARITY_THRESHOLD,
    documentsToIndex: DOCUMENTS_TO_INDEX,
  };
}
