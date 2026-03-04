# MDS (Master Data Services) auf dbt - Architekturplan

## Zielsetzung

Aufbau eines **eigenständigen MDS-Produkts** als Upstream-Datenquelle für Data Vault Projekte. dbt dient als Framework für die Verarbeitungsschicht, während UI und API die Dateneingabe übernehmen.

---

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MDS Service Architecture                           │
│                    (Next.js Full-Stack)                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                     Docker Container                               │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │  │
│  │  │                   Next.js 15 App                              │  │  │
│  │  │                                                               │  │  │
│  │  │  ┌───────────────────────┐   ┌────────────────────────────┐  │  │  │
│  │  │  │  Frontend (SSR)        │   │  API Routes (Backend)      │  │  │  │
│  │  │  │  - Blueprint.js UI     │   │  - /api/models/*           │  │  │  │
│  │  │  │  - Light/Dark Mode     │   │  - /api/entities/*         │  │  │  │
│  │  │  │  - Dashboard Tiles     │   │  - /api/data/*             │  │  │  │
│  │  │  │  - Data Tables         │   │  - /api/commit/*           │  │  │  │
│  │  │  │  - Sidebar Nav         │   │  - /api/dbt/*              │  │  │  │
│  │  │  └───────────────────────┘   └────────────────────────────┘  │  │  │
│  │  │                                                               │  │  │
│  │  │  ┌───────────────────────┐   ┌────────────────────────────┐  │  │  │
│  │  │  │  Auth (MSAL.js)        │   │  dbt Integration          │  │  │  │
│  │  │  │  - Azure Entra ID      │   │  - child_process          │  │  │  │
│  │  │  │  - NextAuth.js         │   │  - dbt run/test            │  │  │  │
│  │  │  │  - Session/JWT         │   │  - Model Generator         │  │  │  │
│  │  │  └───────────────────────┘   └────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                         │
│                              ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                       Azure SQL Database                          │  │
│  │                                                                   │  │
│  │  mds_meta    │  mds_load    │  mds_stage   │  mds_view           │  │
│  │  (Metadata)  │  (Raw Data)  │  (Validated) │  (Output Views)     │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                              │                                         │
│                              ▼                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    Data Vault Integration                         │  │
│  │           mds_view.v_master_* → datavault-dbt/sources            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Mindestanforderungen (Checklist)

| # | Anforderung | Status | Abschnitt |
|---|-------------|--------|----------|
| 1 | Model erstellen (z.B. Projektmanagement) | ✅ | Model Designer |
| 2 | Entities erstellen (Kunden, Lieferanten, Projekte) | ✅ | Entity Builder |
| 3 | Attribute hinzufügen | ✅ | Dynamische Schema-Erweiterung |
| 4 | Deploy → dbt run | ✅ | Workflow / API Endpoints |
| 5 | Daten versionssicher hinzufügen | ✅ | SCD2 Historisierung |
| 6 | DQ Rules Validierung | ✅ | Business Rules als dbt Tests |
| 7 | Commit-Workflow mit Kommentaren, Versionierung, Rollen | ✅ | Commit-Management |
| 8 | Views erstellen | ✅ | Output Views |
| 9 | Integration mit DV-Architektur | ✅ | Integration mit Data Vault |

---

## Technologie-Stack

| Schicht | Technologie | Begründung |
|---------|-------------|------------|
| **Frontend + Backend** | Next.js 15 (App Router) | Full-Stack aus einem Guss, API Routes integriert |
| **UI Library** | Blueprint.js 6.x | Data-dense, Desktop-Class, flat design, Light/Dark Mode |
| **Styling** | Sass + CSS Variables | Blueprint-native, Theme-Support |
| **State** | Zustand + React Query | Leichtgewichtig, Server-State-Management |
| **Job Queue** | BullMQ + Redis | Async dbt Jobs, Retry-Logic |
| **Processing** | dbt-core 1.11+ | Deklarative Modelle, Historisierung, Tests |
| **Database** | Azure SQL | Kompatibel mit bestehendem Data Vault |
| **Cache** | Redis (via Upstash/Azure) | Session Store, Job Queue Backend |
| **Auth** | Auth.js v5 (NextAuth) | Azure Entra ID SSO, native Provider |
| **Logging** | Pino + Application Insights | Structured Logging, Azure Integration |
| **Deployment** | Docker (Single Image) | Next.js Standalone Build |
| **CI/CD** | GitHub Actions | Bestehende Pipeline nutzen |

### Projektpfad

```
/home/user/projects/datavault-dbt/
├── masterdata/              ← MDS Next.js App (NEU)
│   ├── src/
│   ├── dbt/                 ← Embedded dbt Projekt
│   └── Dockerfile
│
├── models/                  ← Bestehendes Data Vault
├── macros/
└── dbt_project.yml
```

### Design-Prinzipien

```
┌───────────────────────────────────────────────────────────────────────┐
│                     UI Design Guidelines                            │
├───────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ✅ Zeitlos          - Keine trendigen Animationen/Effekte           │
│  ✅ Minimalistisch   - Reduktion auf das Wesentliche                 │
│  ✅ Funktional       - Jedes Element hat einen Zweck                 │
│  ✅ Interaktiv       - Sofortiges Feedback, keine Ladezeiten         │
│  ✅ Schnell          - SSR, keine unnötigen Re-Renders               │
│  ✅ Stabil           - Predictable State, Error Boundaries           │
│                                                                       │
│  Inspiration: Windows Server Manager                                 │
│  - Flat Design                                                        │
│  - Dashboard mit Kacheln                                             │
│  - Sidebar Navigation                                                │
│  - Data Tables mit Filter                                            │
│  - Farbkodierte Status-Indikatoren                                   │
│                                                                       │
└───────────────────────────────────────────────────────────────────────┘
```

### UI Library Vergleich

| Library | Data-Dense | Flat Design | Light/Dark | Bundle | Empfehlung |
|---------|------------|-------------|------------|--------|------------|
| **Blueprint.js** | ⭐⭐⭐ | ⭐⭐⭐ | ✅ Eingebaut | ~200KB | ✅ **GEWÄHLT** |
| Radix Themes | ⭐⭐ | ⭐⭐⭐ | ✅ Eingebaut | ~50KB | - |
| shadcn/ui | ⭐⭐ | ⭐⭐⭐ | ✅ Via Tailwind | ~30KB | - |
| Ant Design | ⭐⭐⭐ | ⭐ | ✅ | ~400KB | - |
| MUI | ⭐⭐ | ⭐ | ✅ | ~300KB | - |

### ✅ Entscheidung: Blueprint.js 5.x

**Begründung:**
1. **Von Palantir** - Für data-dense Enterprise UIs entwickelt
2. **Desktop-First** - Wie Windows Server Manager
3. **Komponenten**: Table2, Tree, Card, Menu, Tabs, Forms, Dialogs
4. **Icons**: 700+ Blueprint Icons inklusive
5. **Dark Mode**: `Classes.DARK` toggle
6. **Stabil**: Langzeit-Support, kein Breaking Changes Trend

---

## Abhängigkeiten

### NPM Packages

```json
{
  "dependencies": {
    "next": "^15.1.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    
    "@blueprintjs/core": "^5.14.0",
    "@blueprintjs/table": "^5.3.0",
    "@blueprintjs/icons": "^5.14.0",
    "@blueprintjs/select": "^5.3.0",
    
    "next-auth": "^5.0.0-beta.25",
    "@azure/msal-node": "^2.16.0",
    
    "mssql": "^11.0.0",
    "uuid": "^10.0.0",
    
    "zustand": "^5.0.0",
    "@tanstack/react-query": "^5.62.0",
    
    "bullmq": "^5.30.0",
    "ioredis": "^5.4.0",
    
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "applicationinsights": "^3.4.0",
    
    "sass": "^1.83.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/mssql": "^9.1.0",
    "@types/uuid": "^10.0.0",
    "eslint": "^9.0.0",
    "eslint-config-next": "^15.1.0"
  }
}
```

### Docker Image Dependencies

```dockerfile
# Base: Node 20 Alpine
FROM node:20-alpine

# dbt Dependencies
RUN apk add --no-cache python3 py3-pip git
RUN pip3 install --break-system-packages \
    dbt-core==1.11.2 \
    dbt-sqlserver==1.9.0
```

### Azure Setup (VOR Deployment)

| # | Schritt | Details |
|---|---------|----------|
| 1 | **Azure SQL Database** | Neue DB `MDS` erstellen ODER Schemas im bestehenden `Vault` |
| 2 | **Schemas anlegen** | `mds_meta`, `mds_load`, `mds_stage`, `mds_view`, `mds_master` |
| 3 | **Entra ID App Registration** | Azure Portal → App Registrations → New |
| 4 | **Redirect URI** | `http://localhost:3000/api/auth/callback/microsoft-entra-id` |
| 5 | **Client Secret** | Certificates & secrets → New client secret |
| 6 | **API Permissions** | Microsoft Graph → `User.Read` (Delegated) |
| 7 | **SQL Firewall** | Azure SQL → Networking → Allow Azure services |
| 8 | **Redis Cache** | Azure Cache for Redis ODER Upstash (Serverless) |

### Umgebungsvariablen

```env
# .env.local

# Database
DATABASE_URL=Server=sql-datavault-weu-001.database.windows.net;Database=MDS;User Id=sqladmin;Password=xxx;Encrypt=true

# Auth (Entra ID)
AUTH_MICROSOFT_ENTRA_ID_ID=<client-id>
AUTH_MICROSOFT_ENTRA_ID_SECRET=<client-secret>
AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0

# NextAuth
AUTH_SECRET=<random-32-char-string>
NEXTAUTH_URL=http://localhost:3000

# Redis (Job Queue)
REDIS_URL=redis://localhost:6379
# ODER für Upstash:
# UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
# UPSTASH_REDIS_REST_TOKEN=xxx

# Logging
LOG_LEVEL=info
APPLICATIONINSIGHTS_CONNECTION_STRING=InstrumentationKey=xxx
```

---

## Model Designer (Metadata-Driven)

Der Model Designer ermöglicht das Erstellen von **Datenmodellen** (z.B. "Projektmanagement") mit zugehörigen **Entities** und **Attributen** über die UI.

### Konzept-Hierarchie

```
Model (z.B. "Projektmanagement")
  └── Entity (z.B. "Projekt")
        ├── Attribute: projekt_id (PK, NVARCHAR)
        ├── Attribute: projekt_name (NVARCHAR, required)
        ├── Attribute: kunde_id (FK → Kunde)
        └── Attribute: budget (DECIMAL)
  └── Entity (z.B. "Kunde")
        ├── Attribute: kunde_id (PK)
        └── Attribute: kunde_name (required)
```

### Metadata-Tabellen

```sql
-- Schema für Metadaten
CREATE SCHEMA mds_meta;

-- Models (Datenmodelle / Domänen)
CREATE TABLE mds_meta.model (
    model_id            UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    model_name          NVARCHAR(100) NOT NULL UNIQUE,
    model_description   NVARCHAR(500),
    created_by          NVARCHAR(100) NOT NULL,
    created_at          DATETIME2 DEFAULT GETDATE(),
    is_active           BIT DEFAULT 1
);

-- Entities (Tabellen innerhalb eines Models)
CREATE TABLE mds_meta.entity (
    entity_id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    model_id            UNIQUEIDENTIFIER NOT NULL REFERENCES mds_meta.model(model_id),
    entity_name         NVARCHAR(100) NOT NULL,
    entity_description  NVARCHAR(500),
    business_key_attr   NVARCHAR(100),          -- Welches Attribut ist BK?
    created_by          NVARCHAR(100) NOT NULL,
    created_at          DATETIME2 DEFAULT GETDATE(),
    is_active           BIT DEFAULT 1,
    UNIQUE(model_id, entity_name)
);

-- Attribute (Spalten einer Entity)
CREATE TABLE mds_meta.attribute (
    attribute_id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    entity_id           UNIQUEIDENTIFIER NOT NULL REFERENCES mds_meta.entity(entity_id),
    attribute_name      NVARCHAR(100) NOT NULL,
    data_type           NVARCHAR(50) NOT NULL,  -- NVARCHAR, INT, DECIMAL, DATE, etc.
    max_length          INT,
    is_nullable         BIT DEFAULT 1,
    is_business_key     BIT DEFAULT 0,
    is_foreign_key      BIT DEFAULT 0,
    fk_entity_id        UNIQUEIDENTIFIER,       -- Referenz auf andere Entity
    default_value       NVARCHAR(200),
    validation_regex    NVARCHAR(500),          -- Regex für Validierung
    sort_order          INT DEFAULT 0,
    created_by          NVARCHAR(100) NOT NULL,
    created_at          DATETIME2 DEFAULT GETDATE(),
    UNIQUE(entity_id, attribute_name)
);
```

### API Endpoints für Model Designer

```python
# Models
@app.post("/api/v1/models")
async def create_model(name: str, description: str, user: str):
    """Neues Datenmodell erstellen (z.B. 'Projektmanagement')"""

@app.get("/api/v1/models")
async def list_models():
    """Alle Datenmodelle auflisten"""

# Entities
@app.post("/api/v1/models/{model_id}/entities")
async def create_entity(model_id: str, name: str, description: str, user: str):
    """Entity zu Model hinzufügen (z.B. 'Projekt', 'Kunde')"""

@app.get("/api/v1/models/{model_id}/entities")
async def list_entities(model_id: str):
    """Alle Entities eines Models auflisten"""

# Attribute
@app.post("/api/v1/entities/{entity_id}/attributes")
async def add_attribute(
    entity_id: str,
    name: str,
    data_type: str,
    is_nullable: bool = True,
    is_business_key: bool = False,
    user: str = None
):
    """Attribut zu Entity hinzufügen"""

@app.delete("/api/v1/attributes/{attribute_id}")
async def remove_attribute(attribute_id: str, user: str):
    """Attribut entfernen (nur wenn keine Daten vorhanden)"""
```

---

## Dynamische Schema-Erweiterung

### Option A: EAV (Entity-Attribute-Value) Pattern

Flexibel, aber komplexere Queries.

```sql
-- Generische Datentabelle
CREATE TABLE mds_load.entity_data (
    data_id             BIGINT IDENTITY(1,1) PRIMARY KEY,
    entity_id           UNIQUEIDENTIFIER NOT NULL,
    business_key        NVARCHAR(200) NOT NULL,
    attribute_id        UNIQUEIDENTIFIER NOT NULL,
    value_string        NVARCHAR(MAX),
    value_number        DECIMAL(18,6),
    value_date          DATETIME2,
    -- Metadata
    load_user           NVARCHAR(100) NOT NULL,
    load_timestamp      DATETIME2 DEFAULT GETDATE(),
    load_status         VARCHAR(20) DEFAULT 'PENDING',
    load_batch_id       UNIQUEIDENTIFIER,
    load_comment        NVARCHAR(500)
);
```

### Option B: JSON-Attribute (Empfohlen für Azure SQL)

Kombination aus festen Metadaten und flexiblen JSON-Attributen.

```sql
-- Dynamische Load-Tabelle mit JSON
CREATE TABLE mds_load.entity_data_json (
    data_id             BIGINT IDENTITY(1,1) PRIMARY KEY,
    entity_id           UNIQUEIDENTIFIER NOT NULL,
    business_key        NVARCHAR(200) NOT NULL,
    attributes          NVARCHAR(MAX),          -- JSON: {"name": "...", "budget": 100000}
    -- Metadata
    load_user           NVARCHAR(100) NOT NULL,
    load_timestamp      DATETIME2 DEFAULT GETDATE(),
    load_status         VARCHAR(20) DEFAULT 'PENDING',
    load_batch_id       UNIQUEIDENTIFIER,
    load_comment        NVARCHAR(500),
    -- Constraint für JSON
    CONSTRAINT CK_attributes_json CHECK (ISJSON(attributes) = 1)
);

-- Abfrage mit JSON_VALUE
SELECT 
    business_key,
    JSON_VALUE(attributes, '$.projekt_name') AS projekt_name,
    JSON_VALUE(attributes, '$.budget') AS budget
FROM mds_load.entity_data_json
WHERE entity_id = @entity_id;
```

### Option C: DDL-Generator (Schema zur Laufzeit erstellen)

Bei "Deploy" wird echte Tabelle generiert.

```python
# api/schema_generator.py

def generate_load_table_ddl(entity_id: str) -> str:
    """Generiert CREATE TABLE aus Metadata"""
    entity = get_entity(entity_id)
    attributes = get_attributes(entity_id)
    
    columns = []
    columns.append("load_id BIGINT IDENTITY(1,1) PRIMARY KEY")
    
    for attr in attributes:
        col_def = f"{attr.name} {attr.data_type}"
        if attr.max_length:
            col_def += f"({attr.max_length})"
        if not attr.is_nullable:
            col_def += " NOT NULL"
        columns.append(col_def)
    
    # Metadata-Spalten
    columns.extend([
        "load_user NVARCHAR(100) NOT NULL",
        "load_timestamp DATETIME2 DEFAULT GETDATE()",
        "load_status VARCHAR(20) DEFAULT 'PENDING'",
        "load_batch_id UNIQUEIDENTIFIER",
        "load_comment NVARCHAR(500)"
    ])
    
    ddl = f"CREATE TABLE mds_load.{entity.name} (\n    "
    ddl += ",\n    ".join(columns)
    ddl += "\n);"
    
    return ddl

@app.post("/api/v1/entities/{entity_id}/deploy")
async def deploy_entity(entity_id: str, user: str):
    """Deploy: Erstellt Load-Tabelle und dbt Models"""
    # 1. DDL generieren und ausführen
    ddl = generate_load_table_ddl(entity_id)
    execute_ddl(ddl)
    
    # 2. dbt Model generieren
    generate_dbt_staging_model(entity_id)
    generate_dbt_master_model(entity_id)
    
    # 3. dbt run
    subprocess.run(["dbt", "run", "--select", f"stg_{entity.name}"])
    
    return {"status": "deployed", "entity": entity.name}
```

### dbt Model Generator (Jinja Template)

```python
# api/dbt_generator.py

STG_TEMPLATE = '''
{{
  config(
    materialized='incremental',
    unique_key='{{ business_key }}',
    schema='mds_stage'
  )
}}

SELECT
    {{ business_key }},
    {% for attr in attributes %}
    {{ attr.transform }}({{ attr.name }}) AS {{ attr.name }},
    {% endfor %}
    -- Validation
    CASE
        {% for rule in validation_rules %}
        WHEN {{ rule.condition }} THEN '{{ rule.error_code }}'
        {% endfor %}
        ELSE 'VALID'
    END AS validation_status,
    -- Tracking
    load_id,
    load_user,
    load_timestamp,
    load_batch_id
FROM {{ source('mds_load', '{{ entity_name }}') }}
WHERE load_status = 'PENDING'
{% if is_incremental() %}
  AND load_timestamp > (SELECT MAX(load_timestamp) FROM {{ this }})
{% endif %}
'''

def generate_dbt_staging_model(entity_id: str):
    entity = get_entity(entity_id)
    attributes = get_attributes(entity_id)
    
    rendered = render_template(STG_TEMPLATE, {
        'entity_name': entity.name,
        'business_key': entity.business_key_attr,
        'attributes': attributes,
        'validation_rules': get_validation_rules(entity_id)
    })
    
    path = f"models/mds_stage/stg_{entity.name}.sql"
    write_file(path, rendered)
```

---

## Datenbank-Schema

### Load-Schicht (`mds_load`)
Rohdaten aus UI/API - INSERT ONLY

```sql
CREATE TABLE mds_load.customer (
    load_id         BIGINT IDENTITY(1,1) PRIMARY KEY,
    customer_bk     NVARCHAR(50) NOT NULL,          -- Business Key
    customer_name   NVARCHAR(200),
    country_code    CHAR(2),
    -- Metadata
    load_user       NVARCHAR(100) NOT NULL,         -- Wer hat eingegeben
    load_timestamp  DATETIME2 DEFAULT GETDATE(),
    load_status     VARCHAR(20) DEFAULT 'PENDING',  -- PENDING/STAGED/COMMITTED/REJECTED
    load_batch_id   UNIQUEIDENTIFIER,               -- Gruppierung für Commit
    load_comment    NVARCHAR(500)                   -- Änderungsgrund
);
```

### Stage-Schicht (`mds_stage`) - dbt Models
Validierte, transformierte Daten

```sql
-- models/mds_stage/stg_customer.sql
{{
  config(
    materialized='incremental',
    unique_key='customer_bk',
    on_schema_change='sync_all_columns'
  )
}}

SELECT
    customer_bk,
    UPPER(TRIM(customer_name)) AS customer_name,
    country_code,
    -- Validation Flags
    CASE 
        WHEN customer_name IS NULL THEN 'INVALID_NAME'
        WHEN LEN(country_code) != 2 THEN 'INVALID_COUNTRY'
        ELSE 'VALID'
    END AS validation_status,
    -- Tracking
    load_id,
    load_user,
    load_timestamp,
    load_batch_id
FROM {{ source('mds_load', 'customer') }}
WHERE load_status = 'PENDING'
{% if is_incremental() %}
  AND load_timestamp > (SELECT MAX(load_timestamp) FROM {{ this }})
{% endif %}
```

### Master-Schicht (`mds_master`) - dbt Models
Finaler, historisierter Zustand

```sql
-- models/mds_master/master_customer.sql
{{
  config(
    materialized='incremental',
    unique_key='customer_bk',
    merge_update_columns=['customer_name', 'country_code', 'is_current', 'valid_to']
  )
}}

WITH staged AS (
    SELECT * FROM {{ ref('stg_customer') }}
    WHERE validation_status = 'VALID'
),

new_records AS (
    SELECT
        customer_bk,
        customer_name,
        country_code,
        -- SCD Type 2 Columns
        load_timestamp AS valid_from,
        CAST('9999-12-31' AS DATETIME2) AS valid_to,
        1 AS is_current,
        -- Audit
        load_user AS created_by,
        load_timestamp AS created_at,
        load_batch_id AS commit_batch_id
    FROM staged
)

SELECT * FROM new_records
```

---

## dbt Projekt-Struktur

```
mds-dbt/
├── dbt_project.yml
├── profiles.yml
├── packages.yml
│
├── models/
│   ├── mds_load/
│   │   └── sources.yml              # Load-Tabellen als Sources
│   │
│   ├── mds_stage/
│   │   ├── stg_customer.sql
│   │   ├── stg_product.sql
│   │   ├── stg_supplier.sql
│   │   └── schema.yml               # Tests als Business Rules
│   │
│   ├── mds_master/
│   │   ├── master_customer.sql
│   │   ├── master_product.sql
│   │   ├── master_supplier.sql
│   │   └── schema.yml
│   │
│   └── mds_view/
│       └── v_master_*.sql           # Views für Data Vault
│
├── macros/
│   ├── scd_type2.sql                # SCD2 Historisierung
│   ├── validate_business_key.sql
│   └── audit_columns.sql
│
├── tests/
│   └── business_rules/
│       ├── assert_valid_country.sql
│       └── assert_unique_customer.sql
│
└── seeds/
    └── ref_country_codes.csv        # Referenzdaten
```

---

## API Endpoints (FastAPI)

```python
# api/main.py

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import subprocess

app = FastAPI(title="MDS API", version="1.0")

class MasterDataEntry(BaseModel):
    entity_type: str      # customer, product, supplier
    business_key: str
    attributes: dict
    comment: str | None

class BatchCommit(BaseModel):
    batch_id: str
    approver: str

# Data Entry
@app.post("/api/v1/entry/{entity}")
async def create_entry(entity: str, data: MasterDataEntry, user: str):
    """INSERT into mds_load table"""
    pass

@app.put("/api/v1/entry/{entity}/{business_key}")
async def update_entry(entity: str, business_key: str, data: dict, user: str):
    """INSERT new version into mds_load (SCD2)"""
    pass

# Workflow
@app.post("/api/v1/stage")
async def run_staging(background_tasks: BackgroundTasks):
    """Trigger: dbt run --select mds_stage"""
    background_tasks.add_task(run_dbt, "mds_stage")
    return {"status": "staging_started"}

@app.post("/api/v1/validate")
async def run_validation():
    """Trigger: dbt test --select mds_stage"""
    result = subprocess.run(
        ["dbt", "test", "--select", "mds_stage"],
        capture_output=True
    )
    return {"passed": result.returncode == 0, "output": result.stdout}

@app.post("/api/v1/commit")
async def commit_batch(batch: BatchCommit, background_tasks: BackgroundTasks):
    """Trigger: dbt run --select mds_master"""
    # 1. Update load_status = 'COMMITTED' for batch
    # 2. Run dbt
    background_tasks.add_task(run_dbt, "mds_master")
    return {"status": "commit_started", "batch_id": batch.batch_id}

# Query
@app.get("/api/v1/master/{entity}")
async def get_master_data(entity: str, as_of: str | None = None):
    """Query master data (optional: as of date)"""
    pass

@app.get("/api/v1/history/{entity}/{business_key}")
async def get_history(entity: str, business_key: str):
    """Full version history"""
    pass

def run_dbt(selector: str):
    subprocess.run(["dbt", "run", "--select", selector])
```

---

## Workflow: Datenänderung

```
┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐
│  Entry  │────▶│  Stage  │────▶│Validate │────▶│ Commit  │────▶│ Output  │
└─────────┘     └─────────┘     └─────────┘     └─────────┘     └─────────┘
     │               │               │               │               │
     │               │               │               │               │
  API POST       dbt run         dbt test        dbt run          VIEW
  INSERT →     --select        --select        --select         ready
  mds_load     mds_stage       mds_stage      mds_master        for DV
```

### Status-Übergänge

| Von | Nach | Trigger |
|-----|------|---------|
| - | PENDING | API: POST /entry |
| PENDING | STAGED | dbt run --select mds_stage |
| STAGED | VALID/INVALID | dbt test --select mds_stage |
| VALID | COMMITTED | API: POST /commit |
| INVALID | REJECTED | Manual oder Auto-Reject |

---

## Commit-Management & Versionierung

### Commit-Tabelle

```sql
CREATE TABLE mds_meta.commit_history (
    commit_id           UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    commit_version      INT NOT NULL,                -- Auto-Increment pro Entity
    entity_id           UNIQUEIDENTIFIER NOT NULL,
    batch_id            UNIQUEIDENTIFIER NOT NULL,   -- Referenz auf load_batch_id
    commit_comment      NVARCHAR(1000) NOT NULL,     -- Pflichtfeld!
    commit_user         NVARCHAR(100) NOT NULL,
    commit_timestamp    DATETIME2 DEFAULT GETDATE(),
    records_affected    INT,
    parent_commit_id    UNIQUEIDENTIFIER,            -- Für Rollback-Chain
    commit_status       VARCHAR(20) DEFAULT 'ACTIVE', -- ACTIVE/ROLLED_BACK
    CONSTRAINT FK_commit_entity FOREIGN KEY (entity_id) REFERENCES mds_meta.entity(entity_id)
);

-- Index für schnelle Version-Abfrage
CREATE INDEX IX_commit_entity_version ON mds_meta.commit_history(entity_id, commit_version DESC);
```

### Commit-Workflow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   PENDING   │────▶│   STAGED    │────▶│   VALID     │────▶│  COMMITTED  │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
       │                   │                   │                   │
       │                   │                   │                   │
    INSERT             dbt run              dbt test           API commit
   via API            (staging)           (validation)      (nur Approver)
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
  mds_load.*         validation_status    VALID/INVALID    commit_history
                          gesetzt           Status           + Version
```

### API Endpoints für Commit

```python
class CommitRequest(BaseModel):
    batch_id: str
    comment: str              # Pflichtfeld
    
class RollbackRequest(BaseModel):
    commit_id: str
    reason: str               # Pflichtfeld

@app.post("/api/v1/commit")
async def commit_batch(
    request: CommitRequest,
    user: Annotated[User, Depends(require_role("approver"))]  # Nur Approver!
):
    """
    Commit: Übernimmt validierte Daten in Master-Schicht.
    - Nur Benutzer mit Rolle 'approver' können committen
    - Kommentar ist Pflicht
    - Automatische Versionierung
    """
    # 1. Prüfen ob Batch validiert ist
    validation = check_batch_validation(request.batch_id)
    if not validation.all_valid:
        raise HTTPException(400, f"Batch hat {validation.invalid_count} ungültige Records")
    
    # 2. Nächste Version ermitteln
    next_version = get_next_commit_version(validation.entity_id)
    
    # 3. Commit-Eintrag erstellen
    commit_id = create_commit_record(
        entity_id=validation.entity_id,
        batch_id=request.batch_id,
        version=next_version,
        comment=request.comment,
        user=user.username
    )
    
    # 4. Load-Status auf COMMITTED setzen
    update_load_status(request.batch_id, 'COMMITTED')
    
    # 5. dbt run für Master-Schicht
    await run_dbt_async(["run", "--select", "mds_master"])
    
    return {
        "commit_id": commit_id,
        "version": next_version,
        "status": "committed"
    }

@app.post("/api/v1/rollback")
async def rollback_commit(
    request: RollbackRequest,
    user: Annotated[User, Depends(require_role("admin"))]  # Nur Admin!
):
    """
    Rollback: Macht einen Commit rückgängig.
    - Nur Benutzer mit Rolle 'admin' können rollbacken
    - Setzt is_current=0 für betroffene Master-Records
    - Reaktiviert vorherige Version
    """
    commit = get_commit(request.commit_id)
    
    # 1. Commit als rolled_back markieren
    update_commit_status(request.commit_id, 'ROLLED_BACK')
    
    # 2. Master-Records invalidieren
    invalidate_master_records(commit.batch_id)
    
    # 3. Vorherige Version reaktivieren
    if commit.parent_commit_id:
        reactivate_commit(commit.parent_commit_id)
    
    # 4. Audit-Log
    log_rollback(request.commit_id, request.reason, user.username)
    
    return {"status": "rolled_back", "reason": request.reason}

@app.get("/api/v1/commits/{entity_id}")
async def get_commit_history(entity_id: str, limit: int = 50):
    """Commit-Historie einer Entity abrufen"""
    return query_commits(entity_id, limit)

@app.get("/api/v1/commits/{commit_id}/diff")
async def get_commit_diff(commit_id: str):
    """Diff zwischen diesem und vorherigem Commit"""
    commit = get_commit(commit_id)
    return {
        "added": get_added_records(commit_id),
        "modified": get_modified_records(commit_id),
        "deleted": get_deleted_records(commit_id)
    }
```

---

## RBAC (Role-Based Access Control)

### Rollen-Hierarchie

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           RBAC Model                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   ADMIN ─────────────────────────────────────────────────────────────   │
│     │    - Rollback-Berechtigung                                        │
│     │    - Benutzer-/Rollenverwaltung                                   │
│     │    - Model/Entity löschen                                         │
│     │                                                                    │
│     ▼                                                                    │
│   APPROVER ──────────────────────────────────────────────────────────   │
│     │    - Commit-Berechtigung                                          │
│     │    - Validierung prüfen                                           │
│     │    - Reject-Berechtigung                                          │
│     │                                                                    │
│     ▼                                                                    │
│   EDITOR ────────────────────────────────────────────────────────────   │
│     │    - Daten eingeben/ändern                                        │
│     │    - Attribute hinzufügen                                         │
│     │    - Entity erstellen                                             │
│     │                                                                    │
│     ▼                                                                    │
│   VIEWER ────────────────────────────────────────────────────────────   │
│          - Nur Lesezugriff                                              │
│          - Commit-Historie einsehen                                      │
│          - Daten exportieren                                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Berechtigungs-Tabellen

```sql
-- Rollen
CREATE TABLE mds_meta.role (
    role_id             UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    role_name           NVARCHAR(50) NOT NULL UNIQUE,
    role_description    NVARCHAR(200),
    hierarchy_level     INT NOT NULL    -- 1=Viewer, 2=Editor, 3=Approver, 4=Admin
);

-- Vordefinierte Rollen
INSERT INTO mds_meta.role (role_name, role_description, hierarchy_level) VALUES
('viewer', 'Nur Lesezugriff', 1),
('editor', 'Daten eingeben und ändern', 2),
('approver', 'Commits freigeben', 3),
('admin', 'Vollzugriff inkl. Rollback', 4);

-- Benutzer-Rollen-Zuordnung (pro Model)
CREATE TABLE mds_meta.user_role (
    user_role_id        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_principal      NVARCHAR(200) NOT NULL,     -- Entra ID User Principal
    role_id             UNIQUEIDENTIFIER NOT NULL REFERENCES mds_meta.role(role_id),
    model_id            UNIQUEIDENTIFIER,           -- NULL = global, sonst model-spezifisch
    granted_by          NVARCHAR(100) NOT NULL,
    granted_at          DATETIME2 DEFAULT GETDATE(),
    expires_at          DATETIME2,                   -- Optional: Temporäre Berechtigung
    UNIQUE(user_principal, role_id, model_id)
);

-- Berechtigungen pro Rolle
CREATE TABLE mds_meta.permission (
    permission_id       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    permission_name     NVARCHAR(100) NOT NULL UNIQUE,
    permission_desc     NVARCHAR(200)
);

INSERT INTO mds_meta.permission (permission_name, permission_desc) VALUES
('data:read', 'Daten lesen'),
('data:write', 'Daten eingeben/ändern'),
('data:commit', 'Commits durchführen'),
('data:rollback', 'Rollback durchführen'),
('schema:read', 'Schema/Metadata lesen'),
('schema:write', 'Entities/Attribute erstellen'),
('schema:delete', 'Entities/Attribute löschen'),
('admin:users', 'Benutzerverwaltung');

-- Rollen-Berechtigungen
CREATE TABLE mds_meta.role_permission (
    role_id             UNIQUEIDENTIFIER NOT NULL REFERENCES mds_meta.role(role_id),
    permission_id       UNIQUEIDENTIFIER NOT NULL REFERENCES mds_meta.permission(permission_id),
    PRIMARY KEY (role_id, permission_id)
);

-- Berechtigungsmatrix
INSERT INTO mds_meta.role_permission (role_id, permission_id)
SELECT r.role_id, p.permission_id
FROM mds_meta.role r, mds_meta.permission p
WHERE 
    (r.role_name = 'viewer' AND p.permission_name IN ('data:read', 'schema:read'))
    OR (r.role_name = 'editor' AND p.permission_name IN ('data:read', 'data:write', 'schema:read', 'schema:write'))
    OR (r.role_name = 'approver' AND p.permission_name IN ('data:read', 'data:write', 'data:commit', 'schema:read', 'schema:write'))
    OR (r.role_name = 'admin')  -- Admin bekommt alle Rechte
;
```

### FastAPI Security Integration

```python
# api/security.py

from fastapi import Depends, HTTPException, Security
from fastapi.security import OAuth2PasswordBearer
from msal import ConfidentialClientApplication
import jwt

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class User(BaseModel):
    username: str
    roles: list[str]
    permissions: list[str]

async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    """Validiert Entra ID Token und lädt User-Rollen"""
    try:
        payload = jwt.decode(token, options={"verify_signature": False})  # In Prod: verify!
        user_principal = payload.get("preferred_username")
        
        # Rollen aus DB laden
        roles = get_user_roles(user_principal)
        permissions = get_user_permissions(user_principal)
        
        return User(
            username=user_principal,
            roles=roles,
            permissions=permissions
        )
    except Exception as e:
        raise HTTPException(401, "Invalid token")

def require_role(role: str):
    """Dependency für Rollen-Check"""
    async def role_checker(user: User = Depends(get_current_user)):
        if role not in user.roles:
            raise HTTPException(403, f"Rolle '{role}' erforderlich")
        return user
    return role_checker

def require_permission(permission: str):
    """Dependency für Permission-Check"""
    async def permission_checker(user: User = Depends(get_current_user)):
        if permission not in user.permissions:
            raise HTTPException(403, f"Berechtigung '{permission}' erforderlich")
        return user
    return permission_checker

# Verwendung in Endpoints
@app.post("/api/v1/entry/{entity}")
async def create_entry(
    entity: str,
    data: MasterDataEntry,
    user: Annotated[User, Depends(require_permission("data:write"))]
):
    """Nur Benutzer mit 'data:write' Permission"""
    pass

@app.post("/api/v1/commit")
async def commit_batch(
    request: CommitRequest,
    user: Annotated[User, Depends(require_permission("data:commit"))]
):
    """Nur Benutzer mit 'data:commit' Permission (Approver+)"""
    pass

@app.post("/api/v1/rollback")
async def rollback_commit(
    request: RollbackRequest,
    user: Annotated[User, Depends(require_permission("data:rollback"))]
):
    """Nur Benutzer mit 'data:rollback' Permission (Admin only)"""
    pass
```

### Audit-Log

```sql
CREATE TABLE mds_meta.audit_log (
    audit_id            BIGINT IDENTITY(1,1) PRIMARY KEY,
    timestamp           DATETIME2 DEFAULT GETDATE(),
    user_principal      NVARCHAR(200) NOT NULL,
    action              NVARCHAR(50) NOT NULL,      -- CREATE, UPDATE, DELETE, COMMIT, ROLLBACK
    entity_type         NVARCHAR(50),               -- model, entity, attribute, data
    entity_id           UNIQUEIDENTIFIER,
    old_values          NVARCHAR(MAX),              -- JSON
    new_values          NVARCHAR(MAX),              -- JSON
    ip_address          NVARCHAR(50),
    user_agent          NVARCHAR(500)
);

CREATE INDEX IX_audit_timestamp ON mds_meta.audit_log(timestamp DESC);
CREATE INDEX IX_audit_user ON mds_meta.audit_log(user_principal);
```

---

## Business Rules als dbt Tests

```yaml
# models/mds_stage/schema.yml
version: 2

models:
  - name: stg_customer
    description: "Staged customer master data"
    columns:
      - name: customer_bk
        tests:
          - unique
          - not_null
      
      - name: customer_name
        tests:
          - not_null:
              severity: error
              config:
                where: "validation_status != 'REJECTED'"
      
      - name: country_code
        tests:
          - accepted_values:
              values: ['DE', 'AT', 'CH', 'NL', 'BE', 'FR', 'GB', 'US']
              severity: warn
          
          - relationships:
              to: ref('ref_country_codes')
              field: country_code
```

---

## Integration mit Data Vault

### Output Views für DV Consumption

```sql
-- models/mds_view/v_master_customer.sql
{{
  config(
    materialized='view',
    schema='mds_view'
  )
}}

SELECT
    customer_bk,
    customer_name,
    country_code,
    valid_from,
    valid_to,
    is_current,
    -- DV-kompatible Metadata
    'MDS' AS record_source,
    commit_batch_id AS batch_id
FROM {{ ref('master_customer') }}
WHERE is_current = 1
```

### Data Vault Staging (im DV-Projekt)

```yaml
# datavault-dbt/models/staging/sources.yml
sources:
  - name: mds
    database: MDS_Database
    schema: mds_view
    tables:
      - name: v_master_customer
        description: "Master Data from MDS"
```
```

---

## Next.js Projekt-Struktur

```
masterdata/                          # Projektpfad: /datavault-dbt/masterdata/
├── package.json
├── next.config.ts
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
├── .env.local                       # Lokale Umgebungsvariablen
├── .env.production
│
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── layout.tsx               # Root Layout mit Blueprint Theme
│   │   ├── page.tsx                 # Dashboard (Home)
│   │   ├── globals.scss             # Blueprint + Custom Styles
│   │   ├── error.tsx                # Global Error Boundary
│   │   ├── loading.tsx              # Global Loading State
│   │   │
│   │   ├── (auth)/                  # Auth Group
│   │   │   ├── login/page.tsx
│   │   │   └── logout/page.tsx
│   │   │
│   │   ├── models/                  # Model Designer
│   │   │   ├── page.tsx             # Model-Liste
│   │   │   ├── [modelId]/
│   │   │   │   ├── page.tsx        # Model-Detail
│   │   │   │   └── entities/
│   │   │   │       └── [entityId]/page.tsx
│   │   │   └── new/page.tsx        # Neues Model
│   │   │
│   │   ├── data/                   # Data Entry
│   │   │   ├── [entityId]/
│   │   │   │   ├── page.tsx        # Data Grid
│   │   │   │   └── [recordId]/page.tsx
│   │   │   └── import/page.tsx     # Bulk Import
│   │   │
│   │   ├── commits/                # Commit Management
│   │   │   ├── page.tsx            # Pending Commits
│   │   │   └── history/page.tsx    # Commit Historie
│   │   │
│   │   ├── settings/               # Settings
│   │   │   ├── page.tsx
│   │   │   └── users/page.tsx      # RBAC
│   │   │
│   │   └── api/                    # API Routes (Backend)
│   │       ├── models/
│   │       │   ├── route.ts        # GET/POST /api/models
│   │       │   └── [modelId]/
│   │       │       ├── route.ts
│   │       │       └── entities/route.ts
│   │       │
│   │       ├── entities/
│   │       │   └── [entityId]/
│   │       │       ├── route.ts
│   │       │       ├── attributes/route.ts
│   │       │       └── deploy/route.ts
│   │       │
│   │       ├── data/
│   │       │   └── [entityId]/
│   │       │       ├── route.ts    # CRUD
│   │       │       └── batch/route.ts
│   │       │
│   │       ├── commit/
│   │       │   ├── route.ts        # POST /api/commit
│   │       │   └── rollback/route.ts
│   │       │
│   │       ├── dbt/
│   │       │   ├── run/route.ts    # POST /api/dbt/run
│   │       │   ├── test/route.ts
│   │       │   └── status/route.ts
│   │       │
│   │       └── auth/
│   │           └── [...nextauth]/route.ts
│   │
│   ├── components/                 # UI Components
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx         # Navigation
│   │   │   ├── Header.tsx
│   │   │   └── ThemeToggle.tsx     # Light/Dark Switch
│   │   │
│   │   ├── dashboard/
│   │   │   ├── DashboardTile.tsx   # Kachel-Komponente
│   │   │   ├── StatsCard.tsx
│   │   │   └── RecentActivity.tsx
│   │   │
│   │   ├── models/
│   │   │   ├── ModelList.tsx
│   │   │   ├── EntityTree.tsx
│   │   │   └── AttributeForm.tsx
│   │   │
│   │   ├── data/
│   │   │   ├── DataTable.tsx       # Blueprint Table2
│   │   │   ├── DataForm.tsx
│   │   │   └── ValidationBadge.tsx
│   │   │
│   │   └── commits/
│   │       ├── CommitDialog.tsx
│   │       ├── CommitHistory.tsx
│   │       └── DiffViewer.tsx
│   │
│   ├── lib/                        # Utilities
│   │   ├── db.ts                   # Azure SQL Connection (mssql)
│   │   ├── dbt.ts                  # dbt Runner (child_process)
│   │   ├── queue.ts                # BullMQ Job Queue
│   │   ├── logger.ts               # Pino Logger
│   │   ├── auth.ts                 # NextAuth Config
│   │   └── uuid.ts                 # UUID v4 Generator
│   │
│   ├── hooks/                      # React Hooks
│   │   ├── useModels.ts
│   │   ├── useEntities.ts
│   │   └── useTheme.ts
│   │
│   ├── workers/                    # Background Workers
│   │   └── dbt-worker.ts           # BullMQ Worker für dbt Jobs
│   │
│   └── types/                      # TypeScript Types
│       ├── model.ts
│       ├── entity.ts
│       ├── attribute.ts
│       └── commit.ts
│
└── dbt/                            # Embedded dbt Project
    ├── dbt_project.yml
    ├── profiles.yml
    └── models/
        └── ...
```

---

## Job Queue (BullMQ)

Lange dbt-Jobs werden asynchron über BullMQ verarbeitet.

### Queue Setup

```typescript
// src/lib/queue.ts
import { Queue, Worker, Job } from 'bullmq'
import IORedis from 'ioredis'
import { runDbt } from './dbt'
import { logger } from './logger'

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

// Queue für dbt Jobs
export const dbtQueue = new Queue('dbt-jobs', { connection })

// Job Types
export type DbtJobData = {
  command: 'run' | 'test' | 'compile'
  selector: string
  userId: string
  entityId?: string
}

// Job hinzufügen
export async function enqueueDbtJob(data: DbtJobData): Promise<string> {
  const job = await dbtQueue.add('dbt-execute', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: { age: 3600 * 24 },  // 24h
    removeOnFail: { age: 3600 * 24 * 7 },  // 7d
  })
  logger.info({ jobId: job.id, ...data }, 'dbt job enqueued')
  return job.id!
}

// Job Status abfragen
export async function getJobStatus(jobId: string) {
  const job = await Job.fromId(dbtQueue, jobId)
  if (!job) return null
  
  const state = await job.getState()
  return {
    id: job.id,
    state,
    progress: job.progress,
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
  }
}
```

### Worker

```typescript
// src/workers/dbt-worker.ts
import { Worker } from 'bullmq'
import IORedis from 'ioredis'
import { runDbt } from '../lib/dbt'
import { logger } from '../lib/logger'
import type { DbtJobData } from '../lib/queue'

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
})

const worker = new Worker<DbtJobData>(
  'dbt-jobs',
  async (job) => {
    logger.info({ jobId: job.id, ...job.data }, 'Processing dbt job')
    
    const { command, selector, userId } = job.data
    
    // Progress Updates
    await job.updateProgress(10)
    
    const result = await runDbt(command, selector)
    
    await job.updateProgress(100)
    
    logger.info({ jobId: job.id, success: result.success }, 'dbt job completed')
    
    return result
  },
  {
    connection,
    concurrency: 1,  // Nur 1 dbt Job gleichzeitig
  }
)

worker.on('failed', (job, err) => {
  logger.error({ jobId: job?.id, error: err.message }, 'dbt job failed')
})

export default worker
```

### API Route für Job Status

```typescript
// src/app/api/dbt/status/[jobId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus } from '@/lib/queue'

export async function GET(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const status = await getJobStatus(params.jobId)
  
  if (!status) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }
  
  return NextResponse.json(status)
}
```

---

## Error Handling & Logging

### Pino Logger

```typescript
// src/lib/logger.ts
import pino from 'pino'

const isProduction = process.env.NODE_ENV === 'production'

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  
  transport: isProduction
    ? undefined  // JSON in Production
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
        },
      },
  
  base: {
    service: 'mds',
    version: process.env.npm_package_version,
  },
})

// Request Logger Middleware
export function logRequest(req: Request, context: string) {
  logger.info({
    method: req.method,
    url: req.url,
    context,
  }, 'API Request')
}
```

### Error Boundary (React)

```tsx
// src/app/error.tsx
'use client'

import { Button, NonIdealState } from '@blueprintjs/core'
import { useEffect } from 'react'
import { logger } from '@/lib/logger'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    logger.error({ error: error.message, digest: error.digest }, 'Client Error')
  }, [error])

  return (
    <div style={{ padding: 40 }}>
      <NonIdealState
        icon="error"
        title="Ein Fehler ist aufgetreten"
        description={error.message}
        action={
          <Button intent="primary" onClick={reset}>
            Erneut versuchen
          </Button>
        }
      />
    </div>
  )
}
```

### Loading State (Skeleton)

```tsx
// src/app/loading.tsx
import { Spinner } from '@blueprintjs/core'

export default function Loading() {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh' 
    }}>
      <Spinner size={50} />
    </div>
  )
}
```

### Toast Notifications

```tsx
// src/components/layout/ToastProvider.tsx
'use client'

import { OverlaysProvider, OverlayToaster, Position } from '@blueprintjs/core'
import { createContext, useContext, useRef } from 'react'

const ToastContext = createContext<OverlayToaster | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const toasterRef = useRef<OverlayToaster>(null)

  return (
    <OverlaysProvider>
      <ToastContext.Provider value={toasterRef.current}>
        {children}
        <OverlayToaster 
          ref={toasterRef} 
          position={Position.TOP_RIGHT}
          maxToasts={3}
        />
      </ToastContext.Provider>
    </OverlaysProvider>
  )
}

export function useToast() {
  const toaster = useContext(ToastContext)
  
  return {
    success: (message: string) => toaster?.show({ 
      message, 
      intent: 'success',
      icon: 'tick-circle',
    }),
    error: (message: string) => toaster?.show({ 
      message, 
      intent: 'danger',
      icon: 'error',
    }),
    info: (message: string) => toaster?.show({ 
      message, 
      intent: 'primary',
      icon: 'info-sign',
    }),
  }
}
```

---

## Pagination (Cursor-Based)

```typescript
// src/lib/pagination.ts
import { z } from 'zod'

export const PaginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.number().min(1).max(100).default(50),
  direction: z.enum(['next', 'prev']).default('next'),
})

export type PaginationParams = z.infer<typeof PaginationSchema>

export interface PaginatedResult<T> {
  data: T[]
  nextCursor: string | null
  prevCursor: string | null
  hasMore: boolean
  total: number
}

// SQL Builder für Cursor Pagination
export function buildCursorQuery(
  baseQuery: string,
  params: PaginationParams,
  orderColumn: string = 'created_at'
): string {
  let query = baseQuery
  
  if (params.cursor) {
    const operator = params.direction === 'next' ? '<' : '>'
    query += ` AND ${orderColumn} ${operator} (
      SELECT ${orderColumn} FROM ... WHERE id = '${params.cursor}'
    )`
  }
  
  query += ` ORDER BY ${orderColumn} ${params.direction === 'next' ? 'DESC' : 'ASC'}`
  query += ` OFFSET 0 ROWS FETCH NEXT ${params.limit + 1} ROWS ONLY`
  
  return query
}
```

---

## Docker Deployment

### Dockerfile (Single Image)

```dockerfile
# Dockerfile
FROM node:20-alpine AS base

# Install dbt
RUN apk add --no-cache python3 py3-pip git
RUN pip3 install --break-system-packages dbt-core dbt-sqlserver

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built app
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy dbt project
COPY --chown=nextjs:nodejs dbt ./dbt

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  mds:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=Server=sql-datavault-weu-001.database.windows.net;Database=MDS;User Id=sqladmin;Password=${DB_PASSWORD};Encrypt=true
      - AZURE_AD_CLIENT_ID=${AZURE_AD_CLIENT_ID}
      - AZURE_AD_CLIENT_SECRET=${AZURE_AD_CLIENT_SECRET}
      - AZURE_AD_TENANT_ID=${AZURE_AD_TENANT_ID}
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=http://localhost:3000
    volumes:
      - dbt-logs:/app/dbt/logs
    restart: unless-stopped

volumes:
  dbt-logs:
```

### next.config.ts

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',  // Für Docker optimiert
  
  // Blueprint.js Sass Support
  sassOptions: {
    includePaths: ['./node_modules'],
  },
  
  // Server Actions für Forms
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
}

export default nextConfig
```

---

## Blueprint.js Integration

### globals.scss

```scss
// src/app/globals.scss

// Blueprint Core
@import "@blueprintjs/core/lib/scss/variables";
@import "@blueprintjs/core/lib/css/blueprint.css";
@import "@blueprintjs/icons/lib/css/blueprint-icons.css";
@import "@blueprintjs/table/lib/css/table.css";

// Custom Theme Variables
:root {
  --mds-sidebar-width: 220px;
  --mds-header-height: 50px;
  --mds-tile-gap: 16px;
}

// Dark Mode Support
.bp5-dark {
  --mds-bg-primary: #{$pt-dark-app-background-color};
  --mds-text-primary: #{$pt-dark-text-color};
}

// Light Mode
:root:not(.bp5-dark) {
  --mds-bg-primary: #{$white};
  --mds-text-primary: #{$pt-text-color};
}

// Dashboard Tiles (Server Manager Style)
.mds-tile {
  background: var(--mds-bg-primary);
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: 0;  // Flat Design
  padding: 16px;
  
  &-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 12px;
    border-bottom: 3px solid $pt-intent-primary;
    margin-bottom: 12px;
  }
  
  &-title {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
  }
  
  &-count {
    background: $pt-intent-primary;
    color: white;
    padding: 2px 8px;
    font-size: 12px;
    margin-left: auto;
  }
}

// Sidebar Navigation
.mds-sidebar {
  width: var(--mds-sidebar-width);
  background: #1e3a5f;  // Server Manager Blue
  height: 100vh;
  position: fixed;
  
  .bp5-menu {
    background: transparent;
    
    .bp5-menu-item {
      color: rgba(255, 255, 255, 0.8);
      
      &:hover {
        background: rgba(255, 255, 255, 0.1);
      }
      
      &.bp5-active {
        background: rgba(255, 255, 255, 0.15);
        color: white;
      }
    }
  }
}
```

### Theme Toggle Component

```tsx
// src/components/layout/ThemeToggle.tsx
'use client'

import { Button, Classes } from '@blueprintjs/core'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    // Initial theme from localStorage or system preference
    const stored = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setIsDark(stored === 'dark' || (!stored && prefersDark))
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle(Classes.DARK, isDark)
    localStorage.setItem('theme', isDark ? 'dark' : 'light')
  }, [isDark])

  return (
    <Button
      icon={isDark ? 'flash' : 'moon'}
      minimal
      onClick={() => setIsDark(!isDark)}
      title={isDark ? 'Light Mode' : 'Dark Mode'}
    />
  )
}
```

### Dashboard Tile Component

```tsx
// src/components/dashboard/DashboardTile.tsx
import { Card, Icon, IconName, Tag } from '@blueprintjs/core'
import Link from 'next/link'

interface TileItem {
  label: string
  count?: number
  status?: 'success' | 'warning' | 'danger'
  href?: string
}

interface DashboardTileProps {
  title: string
  icon: IconName
  count?: number
  items: TileItem[]
  color?: string
}

export function DashboardTile({ title, icon, count, items, color = '#d9822b' }: DashboardTileProps) {
  return (
    <div className="mds-tile">
      <div className="mds-tile-header" style={{ borderColor: color }}>
        <Icon icon={icon} size={16} />
        <span className="mds-tile-title">{title}</span>
        {count !== undefined && (
          <span className="mds-tile-count" style={{ background: color }}>{count}</span>
        )}
      </div>
      
      <div className="mds-tile-content">
        {items.map((item, idx) => (
          <div key={idx} className="mds-tile-item">
            {item.status && (
              <Tag 
                minimal 
                intent={item.status === 'success' ? 'success' : item.status === 'warning' ? 'warning' : 'danger'}
              >
                {item.count}
              </Tag>
            )}
            {item.href ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span>{item.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## Azure SSO (MSAL + NextAuth)

### auth.ts

```typescript
// src/lib/auth.ts
import NextAuth, { NextAuthOptions } from 'next-auth'
import AzureADProvider from 'next-auth/providers/azure-ad'

export const authOptions: NextAuthOptions = {
  providers: [
    AzureADProvider({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      tenantId: process.env.AZURE_AD_TENANT_ID!,
      authorization: {
        params: {
          scope: 'openid profile email User.Read',
        },
      },
    }),
  ],
  
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token
        token.idToken = account.id_token
      }
      return token
    },
    
    async session({ session, token }) {
      // Rollen aus DB laden
      const roles = await getUserRoles(token.email as string)
      session.user.roles = roles
      session.accessToken = token.accessToken
      return session
    },
  },
  
  pages: {
    signIn: '/login',
    error: '/login',
  },
}

async function getUserRoles(email: string): Promise<string[]> {
  // Query mds_meta.user_role
  // Return ['viewer'] | ['editor'] | ['approver'] | ['admin']
  return ['editor']  // Default
}
```

### Middleware (Route Protection)

```typescript
// src/middleware.ts
import { withAuth } from 'next-auth/middleware'
import { NextResponse } from 'next/server'

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl
    const { token } = req.nextauth
    
    // Admin-only routes
    if (pathname.startsWith('/settings/users')) {
      if (!token?.roles?.includes('admin')) {
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
    }
    
    // Approver-only routes
    if (pathname.startsWith('/commits') && req.method === 'POST') {
      if (!token?.roles?.includes('approver') && !token?.roles?.includes('admin')) {
        return NextResponse.redirect(new URL('/unauthorized', req.url))
      }
    }
    
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
)

export const config = {
  matcher: [
    '/models/:path*',
    '/data/:path*',
    '/commits/:path*',
    '/settings/:path*',
    '/api/:path*',
  ],
}
```

---

## Nächste Schritte (Implementierung)

| Phase | Schritt | Beschreibung | Dauer |
|-------|---------|--------------|-------|
| **1** | **Projekt scaffolden** | `npx create-next-app@latest masterdata --typescript --app` | 5 min |
| **2** | **Dependencies** | Blueprint.js, NextAuth, mssql, BullMQ, Pino | 10 min |
| **3** | **Basis-Layout** | Sidebar, Header, Theme Toggle, Toast Provider | 1h |
| **4** | **Auth Setup** | Entra ID App Registration + NextAuth Config | 30 min |
| **5** | **Database Schema** | mds_meta Tabellen in Azure SQL erstellen | 30 min |
| **6** | **Dashboard** | Server Manager Style Tiles | 2h |
| **7** | **Model Designer** | CRUD für Models/Entities/Attributes | 4h |
| **8** | **Data Entry** | DataTable + Forms | 4h |
| **9** | **Commit Workflow** | Commit Dialog + History | 2h |
| **10** | **dbt Integration** | Job Queue + API Routes | 2h |
| **11** | **Docker Image** | Dockerfile + docker-compose | 1h |
| **12** | **Testing** | E2E Tests, Manuelle QA | 2h |

**Geschätzte Gesamtdauer: ~20h (3-4 Tage)**

### Kontinuierliche Tests & Optimierungen

> **Wichtig:** Tests und Optimierungen werden nicht erst am Ende durchgeführt, sondern kontinuierlich während jeder Phase!

| Aktivität | Werkzeug | Frequenz |
|-----------|----------|----------|
| **Browser Testing** | Playwright MCP | Nach jedem UI-Component |
| **Unit Tests** | Jest + Testing Library | Nach jeder Funktion |
| **API Tests** | Jest + MSW | Nach jedem Endpoint |
| **Accessibility** | Playwright `browser_snapshot` | Nach jedem Screen |
| **Performance** | Lighthouse CI | Nach jedem Feature |
| **Type Safety** | TypeScript strict mode | Kontinuierlich |
| **Code Review** | ESLint + Prettier | Pre-Commit Hook |

#### Playwright MCP Integration

Die verfügbaren Playwright-Tools für kontinuierliches Testing:

```typescript
// Navigation & Interaktion
mcp_playwright_browser_navigate   // Seiten aufrufen
mcp_playwright_browser_click      // Buttons/Links testen
mcp_playwright_browser_type       // Formulareingaben testen
mcp_playwright_browser_fill_form  // Komplette Formulare

// Validierung
mcp_playwright_browser_snapshot   // Accessibility & DOM-Struktur
mcp_playwright_browser_console_messages  // Fehler im Browser
mcp_playwright_browser_network_requests  // API-Calls prüfen

// Screenshots
mcp_playwright_browser_take_screenshot   // Visuelle Regression
```

**Workflow pro Feature:**

1. Component implementieren
2. `browser_navigate` → App im Dev-Server öffnen
3. `browser_click` / `browser_type` → Interaktionen testen
4. `browser_snapshot` → DOM-Struktur und Accessibility prüfen
5. `browser_console_messages` → Keine Errors?
6. Optimieren wenn nötig → Repeat

---

## Checkliste vor Start

- [ ] Azure SQL: Database `MDS` existiert oder Schemas im `Vault`
- [ ] Azure SQL: Firewall erlaubt Zugriff von Entwicklungs-VM
- [ ] Entra ID: App Registration erstellt (oder während Phase 4)
- [ ] Redis: Lokal via Docker oder Upstash Account
- [ ] Node.js 20+ installiert ✅ (23.6.1 vorhanden)
- [ ] dbt-core installiert ✅ (1.11.2 vorhanden)

---

## Offene Fragen

- [ ] Welche Stammdaten-Entities sind Scope? (Customer, Product, Supplier, ...)
- [ ] Wie viele gleichzeitige Benutzer?
- [x] ~~Approval-Workflow erforderlich?~~ → Ja, RBAC mit Approver-Rolle
- [x] ~~Integration mit bestehendem Identity Provider?~~ → Entra ID
- [x] ~~Hosting-Umgebung?~~ → Docker (Azure Container Apps / App Service)
- [x] ~~Job Queue für dbt?~~ → BullMQ + Redis
- [x] ~~Error Handling?~~ → Error Boundaries + Toast Notifications
- [x] ~~Logging?~~ → Pino + Application Insights
- [ ] Schema-Strategie: EAV, JSON oder DDL-Generator?
- [ ] Rollback-Tiefe: Nur letzter Commit oder beliebig?
- [ ] Redis: Azure Cache for Redis oder Upstash (Serverless)?
