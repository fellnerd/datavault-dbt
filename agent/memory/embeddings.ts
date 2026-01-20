/**
 * Ollama Embeddings Module for Data Vault dbt Agent
 * 
 * Generates text embeddings using Ollama's nomic-embed-text model
 * for RAG (Retrieval-Augmented Generation) functionality.
 */

import { Ollama } from 'ollama';

// ============== Configuration ==============

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const EMBEDDING_DIMENSIONS = 768; // nomic-embed-text uses 768 dimensions

// ============== Ollama Client ==============

let ollamaClient: Ollama | null = null;

function getOllamaClient(): Ollama {
  if (!ollamaClient) {
    ollamaClient = new Ollama({ host: OLLAMA_HOST });
  }
  return ollamaClient;
}

// ============== Types ==============

export interface EmbeddingResult {
  embedding: number[];
  model: string;
  dimensions: number;
}

export interface BatchEmbeddingResult {
  embeddings: number[][];
  model: string;
  dimensions: number;
  count: number;
}

// ============== Embedding Functions ==============

/**
 * Generate embedding for a single text
 */
export async function embedText(text: string): Promise<EmbeddingResult> {
  const client = getOllamaClient();
  
  try {
    const response = await client.embeddings({
      model: EMBED_MODEL,
      prompt: text,
    });

    return {
      embedding: response.embedding,
      model: EMBED_MODEL,
      dimensions: response.embedding.length,
    };
  } catch (error) {
    if (error instanceof Error) {
      // Check if Ollama is not running
      if (error.message.includes('ECONNREFUSED')) {
        throw new Error(`Ollama is not running. Start it with 'ollama serve' or run scripts/setup-ollama.sh`);
      }
      // Check if model is not available
      if (error.message.includes('not found')) {
        throw new Error(`Model '${EMBED_MODEL}' not found. Run: ollama pull ${EMBED_MODEL}`);
      }
      throw error;
    }
    throw new Error('Unknown error generating embedding');
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * More efficient than calling embedText multiple times
 */
export async function embedTexts(texts: string[]): Promise<BatchEmbeddingResult> {
  if (texts.length === 0) {
    return {
      embeddings: [],
      model: EMBED_MODEL,
      dimensions: EMBEDDING_DIMENSIONS,
      count: 0,
    };
  }

  const client = getOllamaClient();
  const embeddings: number[][] = [];

  // Process in batches to avoid overwhelming Ollama
  const batchSize = 10;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    
    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async (text) => {
        const response = await client.embeddings({
          model: EMBED_MODEL,
          prompt: text,
        });
        return response.embedding;
      })
    );
    
    embeddings.push(...batchResults);
  }

  return {
    embeddings,
    model: EMBED_MODEL,
    dimensions: embeddings[0]?.length || EMBEDDING_DIMENSIONS,
    count: embeddings.length,
  };
}

/**
 * Convert embedding to Buffer for SQLite storage
 */
export function embeddingToBuffer(embedding: number[]): Buffer {
  const float32Array = new Float32Array(embedding);
  return Buffer.from(float32Array.buffer);
}

/**
 * Convert Buffer back to embedding array
 */
export function bufferToEmbedding(buffer: Buffer): number[] {
  const float32Array = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.length / 4
  );
  return Array.from(float32Array);
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

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

/**
 * Find most similar embeddings from a list
 */
export function findMostSimilar(
  queryEmbedding: number[],
  candidates: { id: string | number; embedding: number[] }[],
  topK = 5,
  threshold = 0.0
): { id: string | number; similarity: number }[] {
  const results: { id: string | number; similarity: number }[] = [];

  for (const candidate of candidates) {
    const similarity = cosineSimilarity(queryEmbedding, candidate.embedding);
    if (similarity >= threshold) {
      results.push({ id: candidate.id, similarity });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results.slice(0, topK);
}

// ============== Health Check ==============

/**
 * Check if Ollama is available and the model is loaded
 */
export async function checkOllamaHealth(): Promise<{
  available: boolean;
  modelLoaded: boolean;
  error?: string;
}> {
  try {
    const client = getOllamaClient();
    
    // Try to list models
    const models = await client.list();
    const modelLoaded = models.models.some(m => m.name.includes(EMBED_MODEL.split(':')[0]));

    if (!modelLoaded) {
      return {
        available: true,
        modelLoaded: false,
        error: `Model '${EMBED_MODEL}' not found. Run: ollama pull ${EMBED_MODEL}`,
      };
    }

    return {
      available: true,
      modelLoaded: true,
    };
  } catch (error) {
    return {
      available: false,
      modelLoaded: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get embedding model info
 */
export function getEmbeddingConfig(): {
  host: string;
  model: string;
  dimensions: number;
} {
  return {
    host: OLLAMA_HOST,
    model: EMBED_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
  };
}
