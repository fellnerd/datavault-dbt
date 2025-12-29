# MCP Server Dokumentation

## Übersicht

Der MCP (Model Context Protocol) Server ermöglicht die Remote-Nutzung des Data Vault dbt Agents über HTTP. Claude Code Clients können sich verbinden und die 15 verfügbaren Tools nutzen.

## Technische Details

### Transport Layer

- **Protokoll:** HTTP (kein HTTPS, da lokales Netzwerk)
- **Port:** 3001
- **Host:** 0.0.0.0 (alle Interfaces)
- **Format:** JSON-RPC 2.0

### Authentifizierung

Bearer Token Authentication:

```
Authorization: Bearer <token>
```

Tokens werden in `.env` konfiguriert:
```env
MCP_USER_TOKENS=admin:token1,user:token2
```

### Session Management

- Jeder authentifizierte Request erstellt/aktualisiert eine Session
- Sessions werden in SQLite persistiert
- Session-ID wird im Response Header `X-MCP-Session-ID` zurückgegeben
- Sessions haben 1 Stunde Timeout

## API Referenz

### Health Check

```http
GET /health
```

Response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "uptime": 123.456,
  "sessions": 2
}
```

### Server Info

```http
GET /mcp/info
```

Response:
```json
{
  "name": "datavault-dbt-agent",
  "version": "1.0.0",
  "description": "Data Vault 2.1 dbt Agent MCP Server",
  "tools": ["create_hub", "create_satellite", ...]
}
```

### MCP Messages (Hauptendpoint)

```http
POST /mcp/v1/messages
Authorization: Bearer <token>
Content-Type: application/json
```

#### Initialize

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize"
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": {} },
    "serverInfo": {
      "name": "datavault-dbt-agent",
      "version": "1.0.0"
    },
    "sessionId": "uuid-here"
  }
}
```

#### List Tools

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

#### Call Tool

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_hub",
    "arguments": {
      "name": "customer",
      "business_key": "customer_id",
      "source": "stg_customer"
    }
  }
}
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "✓ Hub 'hub_customer' erstellt..."
      }
    ]
  }
}
```

## Tool Referenz

### create_hub

Erstellt einen neuen Hub.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `name` | string | Entity-Name (z.B. "customer") |
| `business_key` | string | Business Key Spalte |
| `source` | string | Staging Source |

### create_satellite

Erstellt einen neuen Satellite.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `name` | string | Entity-Name |
| `hub_name` | string | Zugehöriger Hub |
| `attributes` | string[] | Attribut-Spalten |
| `source` | string | Staging Source |

### create_link

Erstellt einen neuen Link.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `name` | string | Link-Name |
| `hubs` | string[] | Verknüpfte Hubs |
| `source` | string | Staging Source |

### create_staging

Erstellt eine Staging View.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `name` | string | Entity-Name |
| `source_table` | string | External Table Name |

### add_attribute

Fügt Attribute zu einem Satellite hinzu.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `satellite_name` | string | Satellite Name |
| `attributes` | string[] | Neue Attribute |

### run_command

Führt dbt Commands aus.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `command` | string | dbt Command (z.B. "run --select hub_customer") |

### list_files

Listet Dateien in einem Verzeichnis.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `directory` | string | Relativer Pfad |

### read_file

Liest Dateiinhalt.

| Parameter | Typ | Beschreibung |
|-----------|-----|--------------|
| `path` | string | Relativer Dateipfad |

## Fehlerbehandlung

### JSON-RPC Fehlercodes

| Code | Beschreibung |
|------|--------------|
| -32600 | Invalid Request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32603 | Internal error |
| -32001 | Authentication required |
| -32000 | Tool execution failed |

### Beispiel Fehler-Response

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Invalid or expired token"
  }
}
```

## Deployment

### Als systemd Service

```bash
# Service installieren
sudo ./scripts/install-service.sh

# Status prüfen
sudo systemctl status datavault-agent

# Logs
journalctl -u datavault-agent -f
```

### Manuell

```bash
# Development
npm run mcp:dev

# Production
npm run build
npm run mcp
```

## Sicherheit

### Best Practices

1. **Tokens geheim halten** - Nicht in Git committen
2. **Regelmäßig rotieren** - Tokens alle 90 Tage erneuern
3. **Minimale Rechte** - Nur benötigte User anlegen
4. **Firewall** - Port 3001 nur im internen Netzwerk öffnen

### Token Generierung

```bash
openssl rand -hex 32
```

## Monitoring

### Health Check Script

```bash
#!/bin/bash
STATUS=$(curl -s http://localhost:3001/health | jq -r '.status')
if [ "$STATUS" != "ok" ]; then
  echo "MCP Server unhealthy!"
  exit 1
fi
```

### Prometheus Metrics (geplant)

Endpoint: `/metrics`

- `mcp_requests_total`
- `mcp_request_duration_seconds`
- `mcp_active_sessions`
- `mcp_tool_calls_total`
