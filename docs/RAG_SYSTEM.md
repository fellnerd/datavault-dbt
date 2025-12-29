# RAG System Dokumentation

## Übersicht

Das RAG (Retrieval-Augmented Generation) System indiziert Projektdokumentation und stellt relevanten Kontext für AI-gestützte Data Vault Operationen bereit.

## Architektur

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Dokumente      │────▶│  Chunking       │────▶│  Embedding      │
│  (Markdown)     │     │  (500 tokens)   │     │  (Ollama)       │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                                                         ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Kontext für    │◀────│  Similarity     │◀────│  SQLite         │
│  System Prompt  │     │  Search         │     │  (Vektoren)     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## Komponenten

### 1. Embedding Model

- **Modell:** nomic-embed-text
- **Dimensionen:** 768
- **Kontext:** 8192 Tokens
- **Provider:** Ollama (lokal)

### 2. Dokumenten-Index

Folgende Dateien werden indiziert:

| Datei | Beschreibung |
|-------|--------------|
| `LESSONS_LEARNED.md` | Projekt-Entscheidungen & Troubleshooting |
| `docs/SYSTEM.md` | System-Architektur |
| `docs/USER.md` | Benutzerhandbuch |
| `docs/DEVELOPER.md` | Entwickler-Dokumentation |
| `docs/MODEL_ARCHITECTURE.md` | Data Vault Model Patterns |
| `.github/copilot-instructions.md` | Copilot Regeln |
| `.github/instructions/datavault-dbt.instructions.md` | Projekt-Anweisungen |

### 3. Chunking

- **Chunk Size:** 500 Tokens (konfigurierbar)
- **Overlap:** 50 Tokens
- **Strategie:** Paragraph-basiert mit Fallback auf Sätze

### 4. Vektor-Speicher

SQLite mit `doc_chunks` Tabelle:

```sql
CREATE TABLE doc_chunks (
    id INTEGER PRIMARY KEY,
    source_file TEXT,
    chunk_index INTEGER,
    content TEXT,
    content_hash TEXT,
    embedding BLOB,  -- Float32[768]
    metadata TEXT,   -- JSON
    UNIQUE(source_file, chunk_index)
);
```

## Konfiguration

### Umgebungsvariablen

```env
# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# RAG Parameter
RAG_CHUNK_SIZE=500
RAG_CHUNK_OVERLAP=50
RAG_TOP_K=5
RAG_SIMILARITY_THRESHOLD=0.5
```

### Programmatisch

```typescript
import { getRAGConfig } from './memory/rag.js';

const config = getRAGConfig();
// {
//   chunkSize: 500,
//   chunkOverlap: 50,
//   topK: 5,
//   similarityThreshold: 0.5,
//   documentsToIndex: [...]
// }
```

## API

### Dokumente indizieren

```typescript
import { indexAllDocuments, indexDocument } from './memory/rag.js';

// Alle konfigurierten Dokumente
const result = await indexAllDocuments();
// { totalChunks: 42, documentsIndexed: 5, documentsSkipped: 2 }

// Einzelnes Dokument
await indexDocument('docs/SYSTEM.md');
```

### Ähnlichkeitssuche

```typescript
import { searchSimilar } from './memory/rag.js';

const results = await searchSimilar('Wie erstelle ich einen Hub?', 5);
// [
//   {
//     content: "## Hub erstellen...",
//     sourceFile: "docs/USER.md",
//     chunkIndex: 3,
//     similarity: 0.87,
//     metadata: { section: "Hubs" }
//   },
//   ...
// ]
```

### Kontext für Prompt

```typescript
import { getContextForPrompt } from './memory/rag.js';

const context = await getContextForPrompt('Hub für customer erstellen');
// Formatierter Markdown-String mit Top-5 relevanten Chunks
```

### Index-Statistiken

```typescript
import { getIndexStats } from './memory/rag.js';

const stats = getIndexStats();
// {
//   totalChunks: 42,
//   documentsIndexed: ['docs/SYSTEM.md', ...],
//   chunksPerDocument: { 'docs/SYSTEM.md': 8, ... }
// }
```

### Index löschen

```typescript
import { clearIndex, reindexAll } from './memory/rag.js';

// Alle Chunks löschen
clearIndex();

// Komplett neu indizieren
await reindexAll();
```

## Integration

### Im MCP Server

```typescript
// mcp-server.ts
import { getContextForPrompt } from './memory/rag.js';

async function handleToolCall(request, session) {
  // RAG Kontext für die Anfrage holen
  const ragContext = await getContextForPrompt(userQuery);
  
  // In System Prompt injizieren
  const enhancedPrompt = `
    ${baseSystemPrompt}
    
    ## Relevanter Projektkontext
    ${ragContext}
  `;
  
  // Tool ausführen mit erweitertem Kontext
  // ...
}
```

### Automatische Indizierung

Beim Server-Start werden Dokumente automatisch indiziert wenn:
- Noch nicht indiziert (neues Dokument)
- Content-Hash geändert (Dokument wurde bearbeitet)

```typescript
// Startup
const health = await checkOllamaHealth();
if (health.available && health.modelLoaded) {
  await indexAllDocuments();
}
```

## Performance

### Benchmarks (CPU-only, 10.0.0.25)

| Operation | Dauer |
|-----------|-------|
| Single Embedding | ~50ms |
| Batch (10 Chunks) | ~400ms |
| Similarity Search (50 Chunks) | ~5ms |
| Full Index (7 Docs, ~40 Chunks) | ~3s |

### Optimierungen

1. **Content Hash:** Unchanged Dokumente werden übersprungen
2. **Batch Embedding:** Chunks werden in 10er-Gruppen parallel verarbeitet
3. **In-Memory Similarity:** Kein DB-Query für Vektor-Suche nötig

## Troubleshooting

### Ollama nicht verfügbar

```bash
# Status prüfen
curl http://localhost:11434/api/tags

# Service neu starten
sudo systemctl restart ollama
```

### Embedding-Fehler

```typescript
import { checkOllamaHealth } from './memory/embeddings.js';

const health = await checkOllamaHealth();
if (!health.available) {
  console.error('Ollama offline:', health.error);
}
if (!health.modelLoaded) {
  console.error('Model fehlt:', health.error);
  // Fix: ollama pull nomic-embed-text
}
```

### Index korrupt

```bash
# Datenbank löschen und neu erstellen
rm agent/data/agent.db

# Server neu starten - Index wird automatisch erstellt
npm run mcp:dev
```

## Erweiterung

### Weitere Dokumente hinzufügen

In `memory/rag.ts`:

```typescript
const DOCUMENTS_TO_INDEX = [
  // Existierende...
  'LESSONS_LEARNED.md',
  
  // Neue hinzufügen:
  'docs/NEW_DOC.md',
  'README.md',
];
```

### Anderes Embedding-Modell

In `.env`:

```env
OLLAMA_EMBED_MODEL=mxbai-embed-large
```

Dann Modell installieren:

```bash
ollama pull mxbai-embed-large
```

**Achtung:** Bei Modellwechsel muss der Index neu erstellt werden!

```typescript
await reindexAll();
```
