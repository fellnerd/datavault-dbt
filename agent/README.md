# Data Vault dbt Agent 🤖

Ein Claude-powered CLI-Assistent für die Entwicklung von Data Vault 2.1 Modellen mit dbt.

## Features

### CLI Agent (Lokal)
- **Interaktives Menü** mit Pfeil-Tasten-Navigation
- **Automatische Model-Generierung** basierend auf Projektkonventionen
- **Claude AI Integration** für intelligente Aufgabenbearbeitung
- **15 Tools** für Data Vault Entwicklung

### MCP Server (Remote)
- **Multi-User Support** mit Token-basierter Authentifizierung
- **RAG System** mit Ollama für kontextbezogene Antworten
- **Persistente Sessions** in SQLite
- **HTTP API** für Claude Code Integration

## Architektur

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Claude Code)                      │
│                    auf beliebigem Rechner                    │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP + Bearer Token
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 MCP Server (10.0.0.25:3001)                  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Auth        │  │ 15 Tools    │  │ RAG (Ollama)        │  │
│  │ Middleware  │  │ - create_*  │  │ - nomic-embed-text  │  │
│  │             │  │ - edit_*    │  │ - 768 dimensions    │  │
│  └─────────────┘  │ - run_*     │  └─────────────────────┘  │
│                   └─────────────┘                            │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              SQLite (Persistent Memory)                │  │
│  │  - users, sessions, messages                          │  │
│  │  - dv_objects, deployments, undo_stack                │  │
│  │  - doc_chunks (RAG vectors)                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Voraussetzungen
- Node.js >= 18
- npm
- Linux (für Ollama und systemd)

### 1. Dependencies installieren

```bash
cd /home/user/projects/datavault-dbt/agent
npm install
```

### 2. Ollama einrichten (für RAG)

```bash
./scripts/setup-ollama.sh
```

Dies installiert:
- Ollama Server
- nomic-embed-text Embedding-Modell (274 MB)

### 3. Konfiguration

```bash
cp .env.example .env
```

Dann `.env` bearbeiten:

```env
# Anthropic API Key (für CLI Agent)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# MCP Server
MCP_PORT=3001
MCP_HOST=0.0.0.0

# Multi-User Tokens (generieren mit: openssl rand -hex 32)
MCP_USER_TOKENS=admin:your-token,user:another-token

# Ollama
OLLAMA_HOST=http://localhost:11434
OLLAMA_EMBED_MODEL=nomic-embed-text

# SQLite
SQLITE_PATH=./data/agent.db

# RAG
RAG_CHUNK_SIZE=500
RAG_TOP_K=5
```

### 4. Build

```bash
npm run build
```

## Verwendung

### CLI Agent (Interaktiv)

```bash
npm start
# oder
npm run dev  # mit Hot-Reload
```

### MCP Server

**Entwicklung:**
```bash
npm run mcp:dev
```

**Produktion (als Service):**
```bash
sudo ./scripts/install-service.sh
```

## MCP API

### Endpoints

| Endpoint | Methode | Auth | Beschreibung |
|----------|---------|------|--------------|
| `/health` | GET | ❌ | Health Check |
| `/mcp/info` | GET | ❌ | Server Info & Tool-Liste |
| `/mcp/v1/messages` | POST | ✅ | MCP JSON-RPC Endpoint |

### Authentifizierung

Bearer Token im Authorization Header:

```bash
curl -X POST http://10.0.0.25:3001/mcp/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

### Verfügbare Tools

| Tool | Beschreibung |
|------|--------------|
| `create_hub` | Hub erstellen |
| `create_satellite` | Satellite erstellen |
| `create_link` | Link erstellen |
| `create_staging` | Staging View erstellen |
| `create_ref_table` | Reference Table erstellen |
| `create_eff_sat` | Effectivity Satellite erstellen |
| `create_pit` | PIT Table erstellen |
| `create_mart` | Mart View erstellen |
| `add_tests` | dbt Tests hinzufügen |
| `add_attribute` | Attribut zu Satellite hinzufügen |
| `edit_model` | Model bearbeiten |
| `delete_model` | Model löschen |
| `read_file` | Datei lesen |
| `list_files` | Dateien auflisten |
| `run_command` | dbt Command ausführen |

### Beispiel: Tool aufrufen

```bash
curl -X POST http://10.0.0.25:3001/mcp/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "list_files",
      "arguments": {
        "directory": "models/raw_vault/hubs"
      }
    }
  }'
```

## Claude Code Integration

### mcp.json Konfiguration

Auf dem Client-Rechner in Claude Code:

```json
{
  "mcpServers": {
    "datavault": {
      "url": "http://10.0.0.25:3001/mcp/v1/messages",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

## Service Management

```bash
# Status prüfen
sudo systemctl status datavault-agent

# Neu starten
sudo systemctl restart datavault-agent

# Logs anzeigen
journalctl -u datavault-agent -f

# Stoppen
sudo systemctl stop datavault-agent
```

## Projektstruktur

```
agent/
├── index.ts              # CLI Entry Point
├── agent.ts              # Hauptlogik mit Claude API
├── mcp-server.ts         # MCP HTTP Server
├── menu.ts               # Interaktives Menü
├── wizards.ts            # Wizard-UI für Eingaben
├── projectScanner.ts     # Projekt-Metadaten Scanner
├── auth/
│   └── tokens.ts         # Token-Authentifizierung
├── memory/
│   ├── database.ts       # SQLite Wrapper
│   ├── embeddings.ts     # Ollama Embeddings
│   ├── rag.ts            # RAG Pipeline
│   └── schema.sql        # DB Schema
├── tools/
│   ├── createHub.ts
│   ├── createSatellite.ts
│   ├── createLink.ts
│   └── ...               # Weitere Tools
├── scripts/
│   ├── setup-ollama.sh   # Ollama Installation
│   ├── install-service.sh
│   └── datavault-agent.service
└── data/
    └── agent.db          # SQLite Datenbank
```

## Tokens

### Aktuelle Tokens

| User | Token |
|------|-------|
| admin | `733e343ed8702516343ca0145b49d6b68ab0b35e09cbdc8e7b318ab0dd524ece` |
| user | `38127d618ec2f4d7a012505f05ab4e0e371fedec25046f3ac074a9b778b07dd9` |

### Neue Tokens generieren

```bash
openssl rand -hex 32
```

Dann in `.env` unter `MCP_USER_TOKENS` eintragen.

## Troubleshooting

### Ollama nicht erreichbar

```bash
# Status prüfen
systemctl status ollama

# Neu starten
sudo systemctl restart ollama

# Manuell starten
ollama serve
```

### MCP Server Error

```bash
# Logs prüfen
journalctl -u datavault-agent -n 50

# Manuell starten für Debug
cd /home/user/projects/datavault-dbt/agent
npm run mcp:dev
```

### Token ungültig

Prüfen ob Token in `.env` korrekt eingetragen:
```bash
grep MCP_USER_TOKENS .env
```

## Lizenz

Intern - Dimetrics
