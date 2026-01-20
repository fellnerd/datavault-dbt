#!/usr/bin/env node
/**
 * RAG Indexer CLI
 * 
 * Indexes all project documents for RAG retrieval.
 * Can be run manually or via Git hooks.
 * 
 * Usage:
 *   npm run index          # Index all documents
 *   npm run index:force    # Force re-index (ignore cache)
 *   node scripts/index-rag.js --help
 */

import { indexAllDocuments, searchSimilar, getIndexStatsDetailed } from '../memory/rag.js';
import { getDatabase } from '../memory/database.js';

const args = process.argv.slice(2);

async function main() {
  const command = args[0] || 'index';

  switch (command) {
    case 'index':
    case '--index':
      await runIndexing();
      break;
      
    case 'force':
    case '--force':
      await runForceIndexing();
      break;
      
    case 'stats':
    case '--stats':
      await showStats();
      break;
      
    case 'search':
    case '--search':
      await runSearch(args.slice(1).join(' '));
      break;
      
    case 'clear':
    case '--clear':
      await clearIndex();
      break;
      
    case 'help':
    case '--help':
    case '-h':
      showHelp();
      break;
      
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

async function runIndexing() {
  console.log('🚀 Starting RAG indexing...\n');
  
  try {
    const result = await indexAllDocuments();
    console.log('\n✅ Indexing complete!');
    console.log(`   Documents indexed: ${result.documentsIndexed}`);
    console.log(`   Documents skipped: ${result.documentsSkipped}`);
    console.log(`   Total chunks: ${result.totalChunks}`);
  } catch (error) {
    console.error('❌ Indexing failed:', error);
    process.exit(1);
  }
}

async function runForceIndexing() {
  console.log('🔄 Force re-indexing (clearing cache)...\n');
  
  const db = getDatabase();
  
  // Clear all existing chunks using public method
  const deleted = db.clearAllChunks();
  console.log(`   Cleared ${deleted} existing chunks.\n`);
  
  await runIndexing();
}

async function showStats() {
  console.log('📊 RAG Index Statistics\n');
  
  try {
    const stats = await getIndexStatsDetailed();
    
    console.log('┌─────────────────────────────────────────────────┐');
    console.log('│ RAG Index Stats                                 │');
    console.log('├─────────────────────────────────────────────────┤');
    console.log(`│ Total Documents:    ${String(stats.documentsCount).padStart(5)}                       │`);
    console.log(`│ Total Chunks:       ${String(stats.chunksCount).padStart(5)}                       │`);
    console.log(`│ Avg Chunks/Doc:     ${String(stats.avgChunksPerDoc.toFixed(1)).padStart(5)}                       │`);
    console.log('├─────────────────────────────────────────────────┤');
    
    console.log('│ Documents:                                      │');
    for (const doc of stats.documents) {
      const name = doc.source_file.length > 40 
        ? '...' + doc.source_file.slice(-37) 
        : doc.source_file;
      console.log(`│   ${name.padEnd(35)} ${String(doc.chunks).padStart(3)} chunks │`);
    }
    console.log('└─────────────────────────────────────────────────┘');
  } catch (error) {
    console.error('❌ Failed to get stats:', error);
    process.exit(1);
  }
}

async function runSearch(query: string) {
  if (!query) {
    console.error('❌ Please provide a search query');
    console.log('   Usage: node scripts/index-rag.js search "your query"');
    process.exit(1);
  }
  
  console.log(`🔍 Searching for: "${query}"\n`);
  
  try {
    const results = await searchSimilar(query, 5, 0.3);
    
    if (results.length === 0) {
      console.log('No results found. Try a different query or re-index.');
      return;
    }
    
    console.log(`Found ${results.length} results:\n`);
    
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      console.log(`┌─── Result ${i + 1} ──────────────────────────────────────┐`);
      console.log(`│ Source: ${r.sourceFile}`);
      console.log(`│ Similarity: ${(r.similarity * 100).toFixed(1)}%`);
      console.log(`├─────────────────────────────────────────────────┤`);
      console.log(r.content.slice(0, 300) + (r.content.length > 300 ? '...' : ''));
      console.log(`└─────────────────────────────────────────────────┘\n`);
    }
  } catch (error) {
    console.error('❌ Search failed:', error);
    process.exit(1);
  }
}

async function clearIndex() {
  console.log('🗑️  Clearing RAG index...');
  
  const db = getDatabase();
  const deleted = db.clearAllChunks();
  
  console.log(`✅ Index cleared (${deleted} chunks removed).`);
}

function showHelp() {
  console.log(`
RAG Indexer CLI - Index documents for retrieval-augmented generation

Usage:
  npm run index              Index all documents (skip unchanged)
  npm run index:force        Force re-index everything
  npm run index:stats        Show index statistics
  npm run index:search       Search the index

Commands:
  index, --index       Index all configured documents
  force, --force       Clear cache and re-index everything
  stats, --stats       Show index statistics
  search, --search     Search for similar chunks
  clear, --clear       Clear the entire index
  help, --help, -h     Show this help

Examples:
  node dist/scripts/index-rag.js index
  node dist/scripts/index-rag.js search "how to create a hub"
  node dist/scripts/index-rag.js stats
`);
}

main().catch(console.error);
