# Plan: Azure Durable Function für Parquet-Ingestion (v2)

## Übersicht

**Stateful** Azure Durable Function App (Python) für die Erstellung von Parquet-Dateien aus konfigurierbaren API-Quellen mit intelligentem Buffering.

### Key Features

| Feature | Beschreibung |
|---------|--------------|
| **Stateful** | Durable Functions mit Event Sourcing für zuverlässigen State |
| **Parametrierbar** | JSON-Config im Storage Account oder Environment Variables |
| **Schema-basiert** | JSONPath für Payload-Extraktion (z.B. `data.rows[]`) |
| **Consumption Plan** | Kosteneffizient, Pay-per-Execution |
| **Submodule** | Eigenes Git-Repo, eingebunden als Submodule |

---

## Architektur

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Azure Durable Function App (Python)                       │
│                      (parquet-ingestion-func)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Trigger Layer                                                              │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│   │ HTTP Trigger │  │Timer Trigger │  │ Event Grid  │  │ HTTP Admin   │   │
│   │ /ingest      │  │ (Configurable)│ │ (Blob Event)│  │ /admin/*     │   │
│   └──────┬───────┘  └──────┬───────┘  └──────┬──────┘  └──────┬───────┘   │
│          │                 │                 │                 │            │
│          └─────────────────┴─────────────────┴─────────────────┘            │
│                                    │                                         │
│                                    ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │              Durable Orchestrator (Stateful)                         │   │
│   │  - Workflow State persisted via Event Sourcing                      │   │
│   │  - Checkpoints between activities                                    │   │
│   │  - Automatic retry on failure                                        │   │
│   │  - Sub-orchestrations for parallel processing                        │   │
│   └──────────────────────────────┬──────────────────────────────────────┘   │
│                                  │                                           │
│   Activity Functions             │                                           │
│   ┌──────────────────────────────┼──────────────────────────────────────┐   │
│   │                              ▼                                       │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐  │   │
│   │  │ LoadConfig  │  │ FetchAPI    │  │ ParsePayload│  │ WriteParquet│ │   │
│   │  │ Activity    │  │ Activity    │  │ Activity    │  │ Activity   │  │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘  └────────────┘  │   │
│   │                                                                      │   │
│   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │   │
│   │  │ BufferMgmt  │  │ Metadata    │  │ Cleanup     │                  │   │
│   │  │ Activity    │  │ Activity    │  │ Activity    │                  │   │
│   │  └─────────────┘  └─────────────┘  └─────────────┘                  │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Storage Layer                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │  Config Storage     │  │  Buffer Storage     │  │  Output ADLS        │ │
│  │  (Blob Container)   │  │  (Table + Blob)     │  │  (stage-fs)         │ │
│  │                     │  │                     │  │                     │ │
│  │  /config/           │  │  Table: BufferState │  │  /<concept>/        │ │
│  │  ├── sources.json   │  │  Blob: _buffer/*.jsonl│ │  └── delta/*.parquet│ │
│  │  └── schemas/       │  │                     │  │                     │ │
│  │      └── *.json     │  │                     │  │                     │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Durable Functions Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Orchestrator Workflow                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   [Trigger: Timer/HTTP/Event]                                               │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │ 1. LoadConfig       │ ◄─── Storage Blob: config/sources.json            │
│   │    Activity         │      + Environment Variables Override             │
│   └──────────┬──────────┘                                                   │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │ 2. CheckBuffer      │ ◄─── Table Storage: BufferState                   │
│   │    Activity         │      (row_count, first_ts, last_flush)            │
│   └──────────┬──────────┘                                                   │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │ 3. FetchAPI         │ ◄─── HTTP Call to configured endpoint             │
│   │    Activity         │      + Auth (Bearer/Basic/API-Key)                │
│   └──────────┬──────────┘                                                   │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │ 4. ParsePayload     │ ◄─── JSONPath: config.response_path               │
│   │    Activity         │      z.B. "data.rows" → extracts array            │
│   └──────────┬──────────┘                                                   │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │ 5. TransformData    │ ◄─── Schema Mapping + Metadata Injection          │
│   │    Activity         │      (dss_load_date, dss_record_source, ...)      │
│   └──────────┬──────────┘                                                   │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ 6. Buffer Decision                                                   │   │
│   │    ┌────────────────┐   ┌────────────────┐   ┌────────────────┐     │   │
│   │    │ rows >= max    │   │ age >= max_age │   │ force_flush    │     │   │
│   │    │     ↓          │   │      ↓         │   │      ↓         │     │   │
│   │    │ WRITE Parquet  │   │ WRITE Parquet  │   │ WRITE Parquet  │     │   │
│   │    └────────────────┘   └────────────────┘   └────────────────┘     │   │
│   │                                                                      │   │
│   │    ┌────────────────────────────────────────────────────────────┐   │   │
│   │    │ rows < min && age < max_age && !force_flush                │   │   │
│   │    │     ↓                                                       │   │   │
│   │    │ APPEND to Buffer, wait for next trigger                    │   │   │
│   │    └────────────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │ 7. WriteParquet     │ ──► ADLS: /<concept>/<source>/<entity>/delta/     │
│   │    Activity         │      Filename: YYYY-MM-DDTHH-mm-ssZ.parquet       │
│   └──────────┬──────────┘                                                   │
│              │                                                               │
│              ▼                                                               │
│   ┌─────────────────────┐                                                   │
│   │ 8. UpdateMetadata   │ ──► Table Storage: last_fetch, parquet_count      │
│   │    Activity         │                                                    │
│   └──────────┬──────────┘                                                   │
│              │                                                               │
│              ▼                                                               │
│          [Complete]                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Konfiguration

### Konfigurationshierarchie (Priorität)

```
1. Environment Variables      (höchste Priorität - Secrets, Overrides)
2. Storage Blob Config        (sources.json - strukturierte Konfiguration)  
3. Default Values             (niedrigste Priorität - Fallbacks)
```

### Environment Variables

```bash
# Azure Function App Settings
PARQUET_CONFIG_STORAGE_CONNECTION=DefaultEndpointsProtocol=https;...
PARQUET_CONFIG_CONTAINER=config
PARQUET_OUTPUT_ADLS_ACCOUNT=stadlsdatavaultweu001
PARQUET_OUTPUT_CONTAINER=stage-fs

# Optional: Override einzelner Source-Settings (für Secrets)
SOURCE_JIRA_API_TOKEN=@Microsoft.KeyVault(SecretUri=https://kv-xxx.vault.azure.net/secrets/jira-token)
SOURCE_JIRA_ENDPOINT=https://company.atlassian.net/rest/api/3/search

# Buffer Defaults (überschreibbar pro Source in sources.json)
BUFFER_MIN_ROWS=100
BUFFER_MAX_ROWS=10000
BUFFER_MAX_AGE_MINUTES=60
```

### sources.json (Storage Blob)

```json
{
  "$schema": "./schemas/sources-schema.json",
  "version": "1.0",
  "defaults": {
    "buffer": {
      "min_rows": 100,
      "max_rows": 10000,
      "max_age_minutes": 60
    },
    "output": {
      "compression": "snappy",
      "row_group_size": 100000
    }
  },
  "sources": [
    {
      "id": "jira-issues",
      "enabled": true,
      "concept": "jira",
      "source": "api",
      "entity": "vorgang",
      
      "fetch": {
        "endpoint": "${SOURCE_JIRA_ENDPOINT}",
        "method": "GET",
        "auth": {
          "type": "basic",
          "username": "${SOURCE_JIRA_USER}",
          "password": "${SOURCE_JIRA_API_TOKEN}"
        },
        "headers": {
          "Accept": "application/json"
        },
        "params": {
          "jql": "updated >= -{fetch_window_minutes}m",
          "maxResults": "${JIRA_PAGE_SIZE:100}"
        },
        "pagination": {
          "type": "offset",
          "offset_param": "startAt",
          "page_size_param": "maxResults",
          "total_path": "total"
        }
      },
      
      "response": {
        "data_path": "issues",
        "schema_ref": "schemas/jira-issue.json"
      },
      
      "schedule": {
        "type": "timer",
        "cron": "*/15 * * * *",
        "fetch_window_minutes": 20
      },
      
      "buffer": {
        "min_rows": 50,
        "max_rows": 5000
      }
    },
    {
      "id": "werkportal-company",
      "enabled": true,
      "concept": "werkportal",
      "source": "webhook",
      "entity": "company",
      
      "fetch": {
        "endpoint": "${SOURCE_WERKPORTAL_ENDPOINT}/api/v1/companies",
        "method": "POST",
        "auth": {
          "type": "bearer",
          "token": "${SOURCE_WERKPORTAL_TOKEN}"
        },
        "body": {
          "since": "{last_fetch_timestamp}",
          "limit": 1000
        }
      },
      
      "response": {
        "data_path": "data.rows",
        "schema_ref": "schemas/werkportal-company.json"
      },
      
      "schedule": {
        "type": "timer",
        "cron": "*/30 * * * *"
      }
    },
    {
      "id": "generic-webhook",
      "enabled": true,
      "concept": "external",
      "source": "webhook",
      "entity": "events",
      
      "fetch": {
        "type": "passive"
      },
      
      "response": {
        "data_path": "payload.items",
        "schema_ref": "schemas/generic-event.json"
      },
      
      "schedule": {
        "type": "http_trigger"
      }
    }
  ]
}
```

### Schema Definition (JSONPath + Mapping)

```json
// schemas/jira-issue.json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "JIRA Issue Schema",
  "description": "Schema für JIRA Issue Response Mapping",
  
  "source_mapping": {
    "description": "JSONPath mappings from source to target columns",
    "mappings": [
      {
        "source_path": "id",
        "target_column": "issue_id",
        "target_type": "bigint",
        "required": true
      },
      {
        "source_path": "key",
        "target_column": "issue_key",
        "target_type": "string",
        "max_length": 50,
        "required": true
      },
      {
        "source_path": "fields.summary",
        "target_column": "summary",
        "target_type": "string",
        "max_length": 4000
      },
      {
        "source_path": "fields.status.name",
        "target_column": "status_name",
        "target_type": "string",
        "max_length": 100
      },
      {
        "source_path": "fields.priority.name",
        "target_column": "priority",
        "target_type": "string",
        "max_length": 50,
        "default": "Medium"
      },
      {
        "source_path": "fields.project.key",
        "target_column": "project_key",
        "target_type": "string",
        "max_length": 20
      },
      {
        "source_path": "fields.created",
        "target_column": "created_at",
        "target_type": "timestamp",
        "format": "iso8601"
      },
      {
        "source_path": "fields.updated",
        "target_column": "updated_at",
        "target_type": "timestamp",
        "format": "iso8601"
      }
    ]
  },
  
  "metadata_columns": {
    "description": "Automatically injected columns",
    "columns": [
      {
        "name": "dss_load_date",
        "type": "timestamp",
        "source": "system_timestamp"
      },
      {
        "name": "dss_record_source",
        "type": "string",
        "source": "config",
        "value_template": "{concept}/{source}"
      },
      {
        "name": "dss_source_file_name",
        "type": "string",
        "source": "parquet_filename"
      }
    ]
  },
  
  "validation": {
    "required_fields": ["issue_id", "issue_key"],
    "unique_key": ["issue_id"],
    "skip_invalid_rows": true,
    "log_invalid_rows": true
  }
}
```

### Response Data Path Beispiele

| API Response | `data_path` | Ergebnis |
|--------------|-------------|----------|
| `{"issues": [...]}` | `issues` | Array |
| `{"data": {"rows": [...]}}` | `data.rows` | Array |
| `{"response": {"body": {"items": [...]}}}` | `response.body.items` | Array |
| `{"results": [...], "meta": {...}}` | `results` | Array |
| `[...]` (root array) | `$` oder leer | Array |

---

## Projektstruktur (Git Submodule)

```
datavault-dbt/
├── .gitmodules                    # Submodule Referenzen
│   ├── agent                      # Existing: datavault-agent
│   └── parquet-ingestion          # NEW: parquet-ingestion-func
├── parquet-ingestion/             # Git Submodule Root
│   ├── .github/
│   │   └── workflows/
│   │       ├── ci.yml             # Test & Lint
│   │       └── deploy.yml         # Deploy to Azure
│   ├── function_app.py            # Main entry point (Durable)
│   ├── host.json                  # Function App host config
│   ├── local.settings.json.example
│   ├── requirements.txt
│   ├── pyproject.toml             # Python project config
│   │
│   ├── config/                    # Default configs (copied to Storage)
│   │   ├── sources.json.example
│   │   └── schemas/
│   │       ├── sources-schema.json    # JSON Schema for validation
│   │       ├── jira-issue.json
│   │       ├── werkportal-company.json
│   │       └── generic-event.json
│   │
│   ├── orchestrators/             # Durable Orchestrator Functions
│   │   ├── __init__.py
│   │   ├── ingest_orchestrator.py     # Main workflow
│   │   └── batch_orchestrator.py      # Fan-out for multiple sources
│   │
│   ├── activities/                # Durable Activity Functions
│   │   ├── __init__.py
│   │   ├── load_config.py         # Load & merge config
│   │   ├── fetch_api.py           # HTTP client with retry
│   │   ├── parse_payload.py       # JSONPath extraction
│   │   ├── transform_data.py      # Schema mapping
│   │   ├── buffer_manager.py      # Buffer CRUD
│   │   ├── write_parquet.py       # PyArrow writer
│   │   └── update_metadata.py     # State tracking
│   │
│   ├── triggers/                  # Trigger Functions
│   │   ├── __init__.py
│   │   ├── timer_trigger.py       # Scheduled execution
│   │   ├── http_trigger.py        # Manual/webhook ingest
│   │   ├── eventgrid_trigger.py   # Blob events
│   │   └── admin_trigger.py       # Admin operations
│   │
│   ├── core/                      # Shared utilities
│   │   ├── __init__.py
│   │   ├── config_loader.py       # Env + Blob config merger
│   │   ├── jsonpath_parser.py     # JSONPath implementation
│   │   ├── schema_validator.py    # Validate against JSON Schema
│   │   ├── auth_handler.py        # Auth strategies (Basic, Bearer, API-Key)
│   │   └── parquet_utils.py       # PyArrow helpers
│   │
│   ├── tests/
│   │   ├── __init__.py
│   │   ├── conftest.py            # Pytest fixtures
│   │   ├── test_config_loader.py
│   │   ├── test_jsonpath_parser.py
│   │   ├── test_transform.py
│   │   ├── test_buffer.py
│   │   └── test_parquet_writer.py
│   │
│   ├── infra/                     # Infrastructure as Code
│   │   ├── main.bicep
│   │   ├── modules/
│   │   │   ├── function-app.bicep
│   │   │   ├── storage.bicep
│   │   │   └── keyvault.bicep
│   │   └── parameters/
│   │       ├── dev.json
│   │       └── prod.json
│   │
│   └── docs/
│       ├── README.md
│       ├── CONFIGURATION.md
│       ├── SCHEMA_GUIDE.md
│       └── TROUBLESHOOTING.md
```

---

## Durable Function Code (Beispiel)

### function_app.py

```python
import azure.functions as func
import azure.durable_functions as df

app = df.DFApp(http_auth_level=func.AuthLevel.FUNCTION)

# Import orchestrators
from orchestrators.ingest_orchestrator import ingest_orchestrator
from orchestrators.batch_orchestrator import batch_orchestrator

# Import activities
from activities.load_config import load_config
from activities.fetch_api import fetch_api
from activities.parse_payload import parse_payload
from activities.transform_data import transform_data
from activities.buffer_manager import check_buffer, append_buffer, clear_buffer
from activities.write_parquet import write_parquet
from activities.update_metadata import update_metadata

# Import triggers
from triggers.timer_trigger import timer_ingest_trigger
from triggers.http_trigger import http_ingest_trigger
from triggers.admin_trigger import admin_status, admin_flush
```

### orchestrators/ingest_orchestrator.py

```python
import azure.durable_functions as df
from datetime import datetime

def ingest_orchestrator(context: df.DurableOrchestrationContext):
    """
    Main orchestrator for ingesting data from a single source.
    Stateful: checkpoints after each activity call.
    """
    # Input: source_id or full source config
    input_data = context.get_input()
    source_id = input_data.get("source_id")
    force_flush = input_data.get("force_flush", False)
    
    # Step 1: Load configuration (merges env vars + storage config)
    config = yield context.call_activity("load_config", {
        "source_id": source_id
    })
    
    if not config.get("enabled", True):
        return {"status": "skipped", "reason": "source disabled"}
    
    # Step 2: Check current buffer state
    buffer_state = yield context.call_activity("check_buffer", {
        "source_id": source_id
    })
    
    # Step 3: Fetch data from API (if scheduled fetch, not passive)
    records = []
    if config["fetch"].get("type") != "passive":
        fetch_result = yield context.call_activity("fetch_api", {
            "config": config,
            "last_fetch": buffer_state.get("last_fetch_timestamp")
        })
        
        if fetch_result.get("error"):
            return {"status": "error", "error": fetch_result["error"]}
        
        # Step 4: Parse payload using JSONPath
        records = yield context.call_activity("parse_payload", {
            "data": fetch_result["data"],
            "data_path": config["response"]["data_path"]
        })
    else:
        # Passive source: data provided in input
        records = input_data.get("records", [])
    
    if not records:
        return {"status": "success", "records_processed": 0}
    
    # Step 5: Transform data according to schema
    transformed = yield context.call_activity("transform_data", {
        "records": records,
        "schema_ref": config["response"]["schema_ref"],
        "concept": config["concept"],
        "source": config["source"]
    })
    
    # Step 6: Append to buffer
    new_buffer_state = yield context.call_activity("append_buffer", {
        "source_id": source_id,
        "records": transformed,
        "current_state": buffer_state
    })
    
    # Step 7: Decide if we should write Parquet
    should_write = (
        force_flush or
        new_buffer_state["row_count"] >= config["buffer"]["max_rows"] or
        _buffer_age_exceeded(new_buffer_state, config["buffer"]["max_age_minutes"]) or
        (new_buffer_state["row_count"] >= config["buffer"]["min_rows"] and 
         input_data.get("trigger_type") == "timer")
    )
    
    parquet_written = None
    if should_write:
        # Step 8: Write Parquet file
        parquet_result = yield context.call_activity("write_parquet", {
            "source_id": source_id,
            "config": config,
            "buffer_state": new_buffer_state
        })
        parquet_written = parquet_result.get("file_path")
        
        # Step 9: Clear buffer after successful write
        yield context.call_activity("clear_buffer", {
            "source_id": source_id
        })
        
        new_buffer_state["row_count"] = 0
    
    # Step 10: Update metadata
    yield context.call_activity("update_metadata", {
        "source_id": source_id,
        "last_fetch": datetime.utcnow().isoformat(),
        "records_fetched": len(records),
        "parquet_written": parquet_written
    })
    
    return {
        "status": "success",
        "records_fetched": len(records),
        "buffer_rows": new_buffer_state["row_count"],
        "parquet_written": parquet_written
    }

def _buffer_age_exceeded(buffer_state: dict, max_age_minutes: int) -> bool:
    if not buffer_state.get("first_record_timestamp"):
        return False
    first_ts = datetime.fromisoformat(buffer_state["first_record_timestamp"])
    age_minutes = (datetime.utcnow() - first_ts).total_seconds() / 60
    return age_minutes >= max_age_minutes
```

### activities/parse_payload.py

```python
import azure.functions as func
import azure.durable_functions as df
from core.jsonpath_parser import extract_by_path

app = df.DFApp()

@app.activity_trigger(input_name="input")
def parse_payload(input: dict) -> list:
    """
    Extract array of records from API response using JSONPath.
    
    Examples:
    - data_path="issues" → response["issues"]
    - data_path="data.rows" → response["data"]["rows"]
    - data_path="response.body.items" → response["response"]["body"]["items"]
    """
    data = input["data"]
    data_path = input["data_path"]
    
    if not data_path or data_path == "$":
        # Root is already an array
        if isinstance(data, list):
            return data
        raise ValueError(f"Expected array at root, got {type(data)}")
    
    records = extract_by_path(data, data_path)
    
    if not isinstance(records, list):
        raise ValueError(f"Expected array at path '{data_path}', got {type(records)}")
    
    return records
```

### core/jsonpath_parser.py

```python
"""
Simple JSONPath parser for extracting nested data.
Supports dot notation: "data.rows", "response.body.items"
"""

def extract_by_path(data: dict, path: str) -> any:
    """
    Extract value from nested dict using dot notation path.
    
    Args:
        data: Source dictionary
        path: Dot-separated path (e.g., "data.rows")
    
    Returns:
        Value at path or raises KeyError
    """
    if not path:
        return data
    
    current = data
    parts = path.split(".")
    
    for part in parts:
        # Handle array index notation: items[0]
        if "[" in part:
            key, idx = part.split("[")
            idx = int(idx.rstrip("]"))
            current = current[key][idx]
        else:
            if isinstance(current, dict):
                current = current[part]
            else:
                raise KeyError(f"Cannot traverse '{part}' in non-dict: {type(current)}")
    
    return current


def flatten_record(record: dict, prefix: str = "") -> dict:
    """
    Flatten nested dict to single-level dict with dot notation keys.
    
    Example:
        {"fields": {"status": {"name": "Open"}}}
        → {"fields.status.name": "Open"}
    """
    result = {}
    
    for key, value in record.items():
        full_key = f"{prefix}.{key}" if prefix else key
        
        if isinstance(value, dict):
            result.update(flatten_record(value, full_key))
        elif isinstance(value, list):
            # Keep lists as-is (or could expand to item[0], item[1], ...)
            result[full_key] = value
        else:
            result[full_key] = value
    
    return result
```

---

## Git Submodule Setup

### .gitmodules Update

```ini
[submodule "agent"]
	path = agent
	url = https://github.com/fellnerd/datavault-agent.git

[submodule "parquet-ingestion"]
	path = parquet-ingestion
	url = https://github.com/fellnerd/parquet-ingestion-func.git
```

### Initial Setup Commands

```bash
# 1. Create new GitHub repo
gh repo create fellnerd/parquet-ingestion-func --private --description "Azure Durable Function for Parquet Ingestion"

# 2. Add as submodule to datavault-dbt
cd ~/source/datavault-dbt
git submodule add https://github.com/fellnerd/parquet-ingestion-func.git parquet-ingestion

# 3. Initialize submodule
git submodule update --init --recursive

# 4. Commit submodule reference
git add .gitmodules parquet-ingestion
git commit -m "Add parquet-ingestion-func as submodule"
```

---

## Azure Resources

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Resource Group: rg-datavault-weu-001                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  Function App: func-parquet-ingestion-weu-001                      │     │
│  │  - Runtime: Python 3.11                                            │     │
│  │  - Plan: Consumption (Y1)                                          │     │
│  │  - Extension: Durable Functions (azure-functions-durable)          │     │
│  │  - Managed Identity: System-assigned                               │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                           │                                                  │
│                           │ Uses                                             │
│                           ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  Storage Account: stparquetingestfunc001                           │     │
│  │  - Durable Function State (TaskHub)                                │     │
│  │  - Config Container: config/                                       │     │
│  │  - Buffer Container: buffer/                                       │     │
│  │  - Table: BufferMetadata                                           │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                           │                                                  │
│                           │ Writes Parquet to                                │
│                           ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  ADLS Gen2: stadlsdatavaultweu001 (existing)                       │     │
│  │  - Container: stage-fs                                             │     │
│  │  - RBAC: Storage Blob Data Contributor (MI)                        │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  Key Vault: kv-datavault-weu-001 (existing)                        │     │
│  │  - SOURCE_JIRA_API_TOKEN                                           │     │
│  │  - SOURCE_WERKPORTAL_TOKEN                                         │     │
│  │  - RBAC: Key Vault Secrets User (MI)                               │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐     │
│  │  Application Insights: appi-datavault-weu-001 (existing)           │     │
│  │  - Function Logs & Metrics                                         │     │
│  │  - Orchestration Traces                                            │     │
│  └────────────────────────────────────────────────────────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## API Endpoints

| Endpoint | Method | Beschreibung |
|----------|--------|--------------|
| `/api/ingest/{source_id}` | POST | Manuelles Ingest mit JSON Body |
| `/api/ingest/{source_id}?force_flush=true` | POST | Ingest + sofort Parquet schreiben |
| `/api/orchestrators/{source_id}` | POST | Start Durable Orchestrator |
| `/api/orchestrators/{instance_id}/status` | GET | Orchestrator Status |
| `/api/admin/status` | GET | Alle Buffer Stati |
| `/api/admin/flush/{source_id}` | POST | Force Flush einzelner Buffer |
| `/api/admin/flush-all` | POST | Force Flush aller Buffer |
| `/api/admin/config/reload` | POST | Config neu laden |

### Ingest Request Beispiel

```http
POST /api/ingest/generic-webhook?force_flush=false
Content-Type: application/json
x-functions-key: <function-key>

{
  "data": {
    "rows": [
      {"id": 1, "name": "Company A", "city": "Berlin"},
      {"id": 2, "name": "Company B", "city": "Munich"},
      {"id": 3, "name": "Company C", "city": "Hamburg"}
    ]
  }
}
```

---

## requirements.txt

```
# Azure Functions
azure-functions>=1.17.0
azure-durable-functions>=1.2.9

# Azure Storage
azure-storage-blob>=12.19.0
azure-data-tables>=12.5.0
azure-identity>=1.15.0

# Parquet
pyarrow>=14.0.0
pandas>=2.1.0

# HTTP Client
aiohttp>=3.9.0
httpx>=0.26.0

# Config & Validation
pydantic>=2.5.0
jsonschema>=4.20.0
python-dateutil>=2.8.2

# Dev/Test
pytest>=7.4.0
pytest-asyncio>=0.23.0
```

---

## Phasen-Plan

### Phase 1: Foundation (1 Woche)
- [ ] GitHub Repo erstellen
- [ ] Submodule einrichten
- [ ] Durable Function Skeleton
- [ ] Config Loader (Env + Storage)
- [ ] JSONPath Parser

### Phase 2: Core Activities (1 Woche)
- [ ] FetchAPI Activity (mit Auth-Strategien)
- [ ] ParsePayload Activity
- [ ] TransformData Activity (Schema Mapping)
- [ ] WriteParquet Activity

### Phase 3: Buffering (1 Woche)
- [ ] Buffer Manager (Table Storage + Blob)
- [ ] Buffer Decision Logic
- [ ] Admin Endpoints

### Phase 4: Deployment (1 Woche)
- [ ] Bicep Templates
- [ ] CI/CD Pipeline
- [ ] Monitoring Dashboards
- [ ] Dokumentation

### Phase 5: Testing (1 Woche)
- [ ] Unit Tests
- [ ] Integration Tests mit Azure
- [ ] End-to-End Test mit echter API

---

## Nächste Schritte

1. **GitHub Repo** `parquet-ingestion-func` erstellen
2. **Submodule** zu datavault-dbt hinzufügen
3. **Skeleton** mit Durable Function Setup
4. **Config** Schema + Example erstellen

Soll ich mit der Implementierung beginnen?
