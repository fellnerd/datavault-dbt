# Plan: Azure Function für Parquet-Ingestion

## Übersicht

Azure Function App (Python) für die Erstellung von Parquet-Dateien aus verschiedenen Quellen mit intelligentem Buffering.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Azure Function App                                   │
│                      (parquet-ingestion-func)                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Trigger Layer                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│   │ HTTP Trigger │  │Timer Trigger │  │ Event Grid  │  │ Service Bus  │   │
│   │ /ingest      │  │ */15 * * * * │  │ (Blob Event)│  │ (Optional)   │   │
│   └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘   │
│          │                 │                 │                 │            │
│          └─────────────────┴─────────────────┴─────────────────┘            │
│                                    │                                         │
│                                    ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                      Core Orchestrator                               │   │
│   │  - Source Detection (API vs Blob vs JSON)                           │   │
│   │  - Config Loading (sources.json)                                    │   │
│   │  - Buffer Check (min_rows, max_rows, max_age)                       │   │
│   └──────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                           │
│          ┌───────────────────────┼───────────────────────┐                  │
│          ▼                       ▼                       ▼                  │
│   ┌─────────────┐        ┌─────────────┐        ┌─────────────┐            │
│   │ API Fetcher │        │ Blob Reader │        │   Buffer    │            │
│   │ (aiohttp)   │        │ (JSON/CSV)  │        │  Manager    │            │
│   └──────┬──────┘        └──────┬──────┘        └──────┬──────┘            │
│          │                      │                      │                    │
│          └──────────────────────┴──────────────────────┘                    │
│                                 │                                            │
│                                 ▼                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                     Parquet Writer (PyArrow)                         │   │
│   │  - Schema Inference / Validation                                     │   │
│   │  - Compression (SNAPPY)                                              │   │
│   │  - Metadata Injection (dss_*)                                        │   │
│   └──────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                           │
└──────────────────────────────────┼───────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ADLS Gen2 (stage-fs)                               │
│                                                                              │
│   /<concept>/<source>/<entity>/                                             │
│   ├── _buffer/                    ← Temporärer Buffer (JSON Lines)          │
│   │   └── pending.jsonl                                                     │
│   ├── full/                       ← Initial/Full Load                       │
│   │   └── data.parquet                                                      │
│   └── delta/                      ← Incremental                             │
│       ├── 2026-01-28T10-00-00Z.parquet                                      │
│       └── 2026-01-28T10-15-00Z.parquet                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Buffering-Strategie

### Intelligentes Parquet-Schreiben

```
┌─────────────────────────────────────────────────────────────────┐
│                     Buffering Logic                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Config (pro Entity):                                          │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  min_rows: 100        # Minimum bevor Parquet erstellt  │   │
│   │  max_rows: 10000      # Maximum pro Parquet-Datei       │   │
│   │  max_age_minutes: 60  # Spätestens nach 60 Min flushen  │   │
│   │  force_flush: false   # Manuelles Flush-Flag            │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   Decision Tree:                                                │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                                                          │   │
│   │   IF buffer_rows >= max_rows                            │   │
│   │      → WRITE Parquet (split if > max_rows)              │   │
│   │                                                          │   │
│   │   ELSE IF buffer_age >= max_age_minutes                 │   │
│   │      → WRITE Parquet (auch wenn < min_rows)             │   │
│   │                                                          │   │
│   │   ELSE IF buffer_rows >= min_rows AND trigger=timer     │   │
│   │      → WRITE Parquet                                    │   │
│   │                                                          │   │
│   │   ELSE IF force_flush = true                            │   │
│   │      → WRITE Parquet (manueller Trigger)                │   │
│   │                                                          │   │
│   │   ELSE                                                   │   │
│   │      → APPEND to buffer, wait for next trigger          │   │
│   │                                                          │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Buffer Storage Options

| Option | Pros | Cons | Empfehlung |
|--------|------|------|------------|
| **ADLS JSON Lines** | Einfach, kostengünstig | Kein Locking | ✅ Empfohlen |
| **Table Storage** | ACID, schnell | 1MB Entity-Limit | Für Metadata |
| **Redis Cache** | Schnellster Zugriff | Kosten, Volatil | Für High-Volume |
| **Cosmos DB** | Skaliert, TTL | Overkill | Nicht empfohlen |

**Hybrid-Ansatz:**
- **Buffer-Daten:** ADLS `_buffer/pending.jsonl` (append-only)
- **Buffer-Metadata:** Table Storage (row_count, first_timestamp, last_flush)

---

## Source Configuration

### sources.json (im Function App)

```json
{
  "sources": [
    {
      "concept": "jira",
      "source": "api",
      "entity": "vorgang",
      "enabled": true,
      "fetch": {
        "type": "api",
        "url": "https://company.atlassian.net/rest/api/3/search",
        "auth": {
          "type": "basic",
          "username_env": "JIRA_USER",
          "password_env": "JIRA_API_TOKEN"
        },
        "method": "GET",
        "params": {
          "jql": "updated >= -{minutes_since_last_fetch}m",
          "maxResults": 100
        },
        "pagination": {
          "type": "offset",
          "param": "startAt",
          "page_size": 100
        },
        "response_path": "issues"
      },
      "transform": {
        "flatten": true,
        "field_mapping": {
          "id": "issue_id",
          "key": "issue_key",
          "fields.summary": "summary",
          "fields.status.name": "status_name",
          "fields.priority.name": "priority",
          "fields.project.key": "project_key"
        }
      },
      "buffer": {
        "min_rows": 50,
        "max_rows": 5000,
        "max_age_minutes": 60
      },
      "output": {
        "path": "jira/api/vorgang/delta",
        "compression": "snappy"
      }
    },
    {
      "concept": "werkportal",
      "source": "webhook",
      "entity": "company",
      "enabled": true,
      "fetch": {
        "type": "blob",
        "container": "incoming",
        "path_pattern": "werkportal/company/*.json"
      },
      "transform": {
        "flatten": false
      },
      "buffer": {
        "min_rows": 100,
        "max_rows": 10000,
        "max_age_minutes": 30
      },
      "output": {
        "path": "werkportal/webhook/company/delta",
        "compression": "snappy"
      }
    }
  ]
}
```

---

## Function Endpoints

### 1. Timer Trigger (Scheduled Fetch)

```
Function: fetch_scheduled
Trigger:  Timer (*/15 * * * *)
Purpose:  API-Abfragen und Parquet-Generierung
```

```python
# Pseudo-Code
@app.schedule(schedule="*/15 * * * *", arg_name="timer")
async def fetch_scheduled(timer: func.TimerRequest):
    for source in get_enabled_sources(fetch_type="api"):
        # 1. Letzte Fetch-Zeit aus Metadata holen
        last_fetch = get_last_fetch_time(source)
        
        # 2. API abrufen (nur Änderungen seit last_fetch)
        records = await fetch_from_api(source, since=last_fetch)
        
        # 3. Transform & Buffer
        transformed = transform_records(records, source.transform)
        append_to_buffer(source, transformed)
        
        # 4. Check Buffer & Write Parquet
        if should_flush_buffer(source):
            write_parquet(source)
            clear_buffer(source)
        
        # 5. Update Metadata
        update_last_fetch_time(source)
```

### 2. HTTP Trigger (Manual Ingest)

```
Function: ingest_manual
Trigger:  HTTP POST /api/ingest
Purpose:  Manueller Push von JSON-Daten
```

```http
POST /api/ingest?concept=jira&source=webhook&entity=vorgang
Content-Type: application/json

[
  {"issue_id": "123", "summary": "Bug fix", ...},
  {"issue_id": "124", "summary": "Feature", ...}
]
```

```http
POST /api/ingest?concept=jira&source=webhook&entity=vorgang&force_flush=true
Content-Type: application/json

[...]  # Sofort Parquet schreiben, auch wenn < min_rows
```

### 3. Event Grid Trigger (Blob Event)

```
Function: process_blob
Trigger:  Event Grid (BlobCreated in incoming/*)
Purpose:  JSON-Dateien verarbeiten die von externen Systemen abgelegt werden
```

```python
@app.event_grid_trigger(arg_name="event")
async def process_blob(event: func.EventGridEvent):
    blob_url = event.get_json()["url"]
    
    # 1. Source aus Blob-Pfad ermitteln
    source = detect_source_from_path(blob_url)
    
    # 2. JSON laden und transformieren
    records = load_json_blob(blob_url)
    transformed = transform_records(records, source.transform)
    
    # 3. Buffer & Write
    append_to_buffer(source, transformed)
    if should_flush_buffer(source):
        write_parquet(source)
    
    # 4. Processed Blob verschieben/löschen
    archive_blob(blob_url)
```

### 4. HTTP Trigger (Admin)

```
Function: admin_operations
Trigger:  HTTP POST /api/admin/{operation}
Purpose:  Buffer-Status, Force-Flush, Config-Reload
```

```http
# Buffer-Status abfragen
GET /api/admin/status

# Alle Buffer force-flushen
POST /api/admin/flush-all

# Einzelnen Buffer flushen
POST /api/admin/flush?concept=jira&entity=vorgang

# Config neu laden
POST /api/admin/reload-config
```

---

## Metadata-Injection

### Automatisch hinzugefügte Spalten

```python
def inject_metadata(records: list, source: SourceConfig) -> list:
    timestamp = datetime.utcnow().isoformat() + "Z"
    file_name = f"{timestamp.replace(':', '-')}.parquet"
    
    for record in records:
        record["dss_load_date"] = timestamp
        record["dss_record_source"] = f"{source.concept}/{source.source}"
        record["dss_source_file_name"] = file_name
    
    return records
```

### Output Parquet Schema

```
┌─────────────────────────────────────────────────────────────┐
│  Parquet File Schema                                         │
├─────────────────────────────────────────────────────────────┤
│  ... (alle Source-Felder) ...                               │
│  dss_load_date        TIMESTAMP    (UTC, von Function)      │
│  dss_record_source    STRING       (concept/source)         │
│  dss_source_file_name STRING       (Parquet-Dateiname)      │
└─────────────────────────────────────────────────────────────┘
```

---

## Projektstruktur

```
parquet-ingestion-func/
├── function_app.py              # Main entry point
├── host.json                    # Function App config
├── local.settings.json          # Local dev settings (gitignored)
├── requirements.txt             # Python dependencies
├── config/
│   └── sources.json             # Source definitions
├── core/
│   ├── __init__.py
│   ├── orchestrator.py          # Main orchestration logic
│   ├── buffer_manager.py        # Buffer read/write/flush
│   ├── parquet_writer.py        # PyArrow Parquet generation
│   └── metadata.py              # dss_* injection
├── fetchers/
│   ├── __init__.py
│   ├── api_fetcher.py           # REST API client
│   ├── blob_fetcher.py          # ADLS blob reader
│   └── transform.py             # Field mapping, flattening
├── triggers/
│   ├── __init__.py
│   ├── timer_trigger.py         # Scheduled fetch
│   ├── http_trigger.py          # Manual ingest
│   ├── eventgrid_trigger.py     # Blob events
│   └── admin_trigger.py         # Admin operations
└── tests/
    ├── test_buffer.py
    ├── test_parquet.py
    └── test_transform.py
```

---

## Azure Resources

```
┌─────────────────────────────────────────────────────────────────┐
│  Resource Group: rg-datavault-weu-001                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Function App: func-parquet-ingestion-weu-001          │     │
│  │  - Runtime: Python 3.11                                │     │
│  │  - Plan: Consumption (Y1) oder Premium (EP1)           │     │
│  │  - Managed Identity: Enabled                           │     │
│  └────────────────────────────────────────────────────────┘     │
│                           │                                      │
│                           │ Uses                                 │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Storage Account: stparquetingestweu001                │     │
│  │  - Function App Storage (Logs, State)                  │     │
│  │  - Table: BufferMetadata                               │     │
│  └────────────────────────────────────────────────────────┘     │
│                           │                                      │
│                           │ Writes to                            │
│                           ▼                                      │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  ADLS Gen2: stadlsdatavaultweu001                      │     │
│  │  - Container: stage-fs (existing)                      │     │
│  │  - RBAC: Storage Blob Data Contributor                 │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Key Vault: kv-datavault-weu-001                       │     │
│  │  - JIRA_API_TOKEN                                      │     │
│  │  - Other API credentials                               │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Application Insights: appi-datavault-weu-001          │     │
│  │  - Logging, Metrics, Tracing                           │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Deployment

### Infrastructure as Code (Bicep)

```bicep
// main.bicep
param location string = 'westeurope'
param environmentName string = 'dev'

module functionApp 'modules/function-app.bicep' = {
  name: 'functionApp'
  params: {
    name: 'func-parquet-ingestion-weu-001'
    location: location
    runtime: 'python'
    runtimeVersion: '3.11'
    storageAccountName: storageAccount.outputs.name
    appInsightsName: appInsights.outputs.name
    keyVaultName: keyVault.outputs.name
    adlsAccountName: 'stadlsdatavaultweu001'
  }
}
```

### CI/CD (GitHub Actions)

```yaml
# .github/workflows/deploy-function.yml
name: Deploy Parquet Ingestion Function

on:
  push:
    branches: [main]
    paths:
      - 'parquet-ingestion-func/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Install dependencies
        run: pip install -r parquet-ingestion-func/requirements.txt
      
      - name: Run tests
        run: pytest parquet-ingestion-func/tests/
      
      - name: Deploy to Azure Functions
        uses: Azure/functions-action@v1
        with:
          app-name: 'func-parquet-ingestion-weu-001'
          package: 'parquet-ingestion-func'
          publish-profile: ${{ secrets.AZURE_FUNCTIONAPP_PUBLISH_PROFILE }}
```

---

## requirements.txt

```
azure-functions>=1.17.0
azure-storage-blob>=12.19.0
azure-data-tables>=12.5.0
azure-identity>=1.15.0
pyarrow>=14.0.0
pandas>=2.1.0
aiohttp>=3.9.0
pydantic>=2.5.0
python-dateutil>=2.8.2
```

---

## Monitoring & Alerting

### Application Insights Queries

```kusto
// Parquet-Dateien pro Tag
customEvents
| where name == "ParquetWritten"
| summarize count() by bin(timestamp, 1d), tostring(customDimensions.concept)

// Buffer-Größen über Zeit
customMetrics
| where name == "BufferRowCount"
| summarize avg(value) by bin(timestamp, 15m), tostring(customDimensions.entity)

// API-Fehler
exceptions
| where operation_Name contains "fetch"
| summarize count() by bin(timestamp, 1h), outerMessage
```

### Alerts

| Alert | Condition | Action |
|-------|-----------|--------|
| Fetch Failed | Exception count > 3 in 15 min | Email + Teams |
| Buffer Overflow | BufferRowCount > max_rows | Auto-flush |
| No Parquet Written | 0 files in 2 hours | Warning Email |

---

## Sicherheit

| Aspekt | Implementierung |
|--------|-----------------|
| **Secrets** | Key Vault References (`@Microsoft.KeyVault(...)`) |
| **Network** | VNET Integration (optional für Premium) |
| **Auth** | Managed Identity für ADLS/KeyVault |
| **API Auth** | Credentials in Key Vault |
| **CORS** | Disabled (nur interne Trigger) |

---

## Phasen-Plan

### Phase 1: MVP (1-2 Wochen)
- [ ] Function App Skeleton
- [ ] Timer Trigger für eine API (z.B. JIRA)
- [ ] Einfaches Parquet-Schreiben (ohne Buffer)
- [ ] ADLS Integration

### Phase 2: Buffering (1 Woche)
- [ ] Buffer Manager (JSONL + Table Storage)
- [ ] min_rows / max_rows / max_age Logic
- [ ] Admin Endpoint für Status

### Phase 3: Multi-Source (1 Woche)
- [ ] sources.json Config
- [ ] HTTP Trigger für manuelle Ingestion
- [ ] Event Grid für Blob Events

### Phase 4: Production (1 Woche)
- [ ] Bicep Templates
- [ ] CI/CD Pipeline
- [ ] Monitoring & Alerting
- [ ] Dokumentation

---

## Alternativen (nicht empfohlen für diesen Use Case)

| Alternative | Warum nicht |
|-------------|-------------|
| **Azure Data Factory** | Overkill, teurer, weniger flexibel für API-Calls |
| **Synapse Pipelines** | Bereits vorhanden, aber für Batch gedacht |
| **Logic Apps** | Parquet-Support schwach |
| **Stream Analytics** | Für echtes Streaming, nicht 15-Min-Zyklen |
| **Databricks** | Zu teuer für diesen Use Case |

---

## Nächste Schritte

1. **Entscheidung:** Consumption vs. Premium Plan?
2. **PoC:** JIRA-API als erste Source?
3. **Repo-Struktur:** Eigenes Repo oder Subfolder in datavault-dbt?
