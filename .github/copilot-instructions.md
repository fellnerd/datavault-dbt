# Copilot Instructions - Data Vault 2.1 dbt Project

## Project Overview
Multi-tenant Data Vault 2.1 on Azure SQL using dbt Core with `automate_dv` package. Single codebase deploys to isolated tenant databases via dbt targets.

## Architecture Flow
```
PostgreSQL → Synapse Pipeline → ADLS Parquet → External Table (stg.ext_*) → Staging View (stg.stg_*) → Hub/Sat/Link
```

## Schema Naming Convention

| Layer | Folder | Schema | Usage |
|-------|--------|--------|-------|
| Staging | `staging/` | `stg` | All sources |
| Raw Vault (common) | `raw_vault/_common/` | `vault` | Cross-source objects |
| Raw Vault (source) | `raw_vault/<concept>/` | `vault_<concept>` | Source-specific objects |
| Business Vault | `business_vault/` | `vault` | PITs, Bridges |
| Mart (common) | `mart/_common/` | `mart` | Shared dimensions |
| Mart (domain) | `mart/<concept>/` | `mart_<concept>` | Domain-specific views |

**Pattern:** `_common` → base schema, `<concept>` → `<base>_<concept>`

## Critical Constraints (Azure SQL Basic Tier)
- **Always set** `as_columnstore: false` in incremental models
- **Never hardcode** database names - use `{{ target.database }}` in sources.yml
- **Authentication:** Azure CLI only (`authentication: cli`) - no passwords in profiles

## dbt Commands
```bash
source .venv/bin/activate
dbt run                              # Dev (Vault DB)
dbt run --target werkportal          # Prod tenant
dbt run-operation stage_external_sources  # Create/update external tables
```

## Naming Conventions
| Object | Pattern | Example |
|--------|---------|---------|
| External Table | `stg.ext_<concept>_<entity>` | `stg.ext_werkportal_company` |
| Staging View | `stg.<concept>_<entity>` | `stg.werkportal_company` |
| Hub | `vault_<concept>.hub_<entity>` | `vault_werkportal.hub_company` |
| Satellite | `vault_<concept>.sat_<entity>` | `vault_werkportal.sat_company` |
| Link | `vault_<concept>.link_<e1>_<e2>` | `vault_werkportal.link_company_country` |
| DC Link | `vault_<concept>.link_<dc>_<parent>` | `vault_werkportal.link_contact_contractor` |
| DC Satellite | `vault_<concept>.sat_<dc>_<parent>_dc` | `vault_werkportal.sat_contact_contractor_dc` |
| Common Hub | `vault.hub_<entity>` | `vault.hub_company` (merged) |
| Hash Key | `hk_<entity>` | `hk_company` |
| Link Hash Key | `hk_link_<dc>_<parent>` | `hk_link_contact_contractor` |
| Hash Diff | `hd_<entity>` | `hd_company` |
| DC Hash Diff | `hd_<dc>_<parent>_dc` | `hd_contact_contractor_dc` |
| Metadata | `dss_*` prefix | `dss_load_date`, `dss_record_source` |

## Dependent Child (DC) Pattern
Use DC when an entity has **no own stable Business Key** and is identified by parent relationship + DCK columns.

**Example: Contact as Dependent Child of Contractor**
```
hub_contractor → link_contact_contractor → sat_contact_contractor_dc
                 (HASH = FK + DCK)         (DCK: name, email1 in payload)
```

**Staging Requirements for DC:**
```sql
-- All hashes calculated in staging (automate_dv best practice)
hk_contractor                -- FK Hash to Parent Hub
hk_link_contact_contractor   -- Link Hash = HASH(company_contractor ^^ name ^^ email1)
hd_contact_contractor_dc     -- Hashdiff for change detection
```

**DC Link Model (Pure - only 1 FK):**
```yaml
src_pk: "hk_link_contact_contractor"
src_fk: "hk_contractor"  # Only parent FK, no second Hub
src_ldts: "dss_load_date"
src_source: "dss_record_source"
# NO src_payload for DC Links!
```

**DC Satellite Model:**
```yaml
src_pk: "hk_link_contact_contractor"  # References Link, not Hub
src_hashdiff: 
  source_column: "hd_contact_contractor_dc"
  alias: "HASHDIFF"
src_payload:
  - "name"       # DCK Column
  - "email1"     # DCK Column
  - "phone"      # Additional attributes
```

## Hash Calculation (SQL Server Native)
Do NOT use automate_dv hash macros - they're incompatible with SQL Server. Use:
```sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', ISNULL(CAST(column AS NVARCHAR(MAX)), '')), 2)
```
See [werkportal_company.sql](models/staging/werkportal_company.sql) for the pattern.

## Adding a New Source System (Concept)
1. **Create folder:** `models/raw_vault/<concept>/hubs/`, `satellites/`, `links/`
2. **Add config to dbt_project.yml:**
   ```yaml
   raw_vault:
     <concept>:
       +schema: vault_<concept>
       +materialized: incremental
       +incremental_strategy: append
       +as_columnstore: false
   ```
3. **Create staging:** Add external table to `sources.yml`, create `<concept>_<entity>.sql`
4. **Create vault objects:** Hub, Satellite, Link in the new folder
5. **Deploy:** `dbt run-operation stage_external_sources && dbt run --select raw_vault.<concept>`

## Adding a New Entity (to existing concept)
1. **External Table:** Add to [sources.yml](models/staging/sources.yml) with full column definitions
2. **Staging View:** Create `models/staging/<concept>_<entity>.sql` with hash calculations
3. **Hub:** Create `models/raw_vault/<concept>/hubs/hub_<entity>.sql`
4. **Satellite:** Create `models/raw_vault/<concept>/satellites/sat_<entity>.sql`
5. **Schema YAML:** Document model in corresponding `_<layer>__models.yml` file (see below)
6. **Deploy:** `dbt run-operation stage_external_sources && dbt run --select +raw_vault.<concept>.hub_<entity> +raw_vault.<concept>.sat_<entity>`

## dbt Model Selection (IMPORTANT)

> **Verwende immer vollständige Pfade!** Model-Namen wie `hub_company` können in mehreren Concepts existieren.

```bash
# ❌ Vermeiden - wählt ALLE hub_company
dbt run --select hub_company

# ✅ Empfohlen - spezifischer Pfad
dbt run --select raw_vault.werkportal.hub_company

# ✅ Mit Upstream-Dependencies (baut Staging automatisch)
dbt run --select +raw_vault.werkportal.hub_company

# ✅ Alle Models eines Concepts
dbt run --select raw_vault.werkportal
```

## Schema YAML Documentation (REQUIRED)

**⚠️ Every model MUST be documented in a schema YAML file!**

The VS Code Extension and dbt documentation rely on these files for column information.

### File Naming Convention
| Layer | File | Location |
|-------|------|----------|
| Staging | `_staging__models.yml` | `models/staging/` |
| Raw Vault | `_<concept>__models.yml` | `models/raw_vault/<concept>/` |
| Business Vault | `_business_vault__models.yml` | `models/business_vault/` |
| Mart | `_<concept>__models.yml` | `models/mart/<concept>/` |

### Template
```yaml
version: 2

models:
  - name: <model_name>
    description: Description of the model
    columns:
      - name: hk_<entity>
        description: Hash Key (Primary Key)
        data_type: char(64)
        tests:
          - not_null
          - unique
      - name: object_id
        description: Business Key
        data_type: bigint
        tests:
          - not_null
      - name: <attribute>
        description: Attribute description
        data_type: nvarchar(4000)
      - name: dss_load_date
        description: Load timestamp
        data_type: datetime2(7)
        tests:
          - not_null
      - name: dss_record_source
        description: Data source
        data_type: varchar(100)
        tests:
          - not_null
```

### Generate from Database
Use `mssql_connect` + `mssql_run_query` to get column definitions:
```sql
SELECT c.name, t.name AS data_type, c.max_length, c.precision, c.scale, c.is_nullable
FROM sys.views v
JOIN sys.columns c ON v.object_id = c.object_id
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE SCHEMA_NAME(v.schema_id) = 'stg' AND v.name = '<view_name>'
ORDER BY c.column_id;
```

## Project Structure
```
models/
├── staging/                    → stg
├── raw_vault/
│   ├── _common/                → vault (cross-source)
│   │   ├── hubs/
│   │   ├── satellites/
│   │   └── links/
│   ├── werkportal/             → vault_werkportal
│   │   ├── hubs/
│   │   ├── satellites/
│   │   └── links/
│   └── adventureworks/         → vault_adventureworks
├── business_vault/             → vault
└── mart/
    ├── _common/                → mart (shared dims)
    └── project/                → mart_project
```

## Key Files
- [dbt_project.yml](dbt_project.yml) - Model configs, schema assignments
- [models/staging/sources.yml](models/staging/sources.yml) - External table definitions (dbt-external-tables)
- [models/staging/_staging__models.yml](models/staging/_staging__models.yml) - Staging model documentation with columns
- [models/raw_vault/werkportal/_werkportal__models.yml](models/raw_vault/werkportal/_werkportal__models.yml) - Werkportal vault documentation
- [macros/generate_schema_name.sql](macros/generate_schema_name.sql) - Strips default schema prefix
- [docs/DEVELOPER.md](docs/DEVELOPER.md) - Full developer guide
- [docs/MODEL_ARCHITECTURE.md](docs/MODEL_ARCHITECTURE.md) - Data model documentation

## Multi-Tenant Targets
| Target | Database | Usage |
|--------|----------|-------|
| `dev` | Vault | Shared development |
| `werkportal` | Vault_Werkportal | Production |
| `ewb` | Vault_EWB | Production (planned) |

## Common Pitfalls
- Schema creates as `dv_stg` instead of `stg` → Check `generate_schema_name` macro
- External table errors → Run `dbt run-operation stage_external_sources` first
- Cross-database error → Replace hardcoded DB with `{{ target.database }}`
- Object in wrong schema → Check folder structure matches dbt_project.yml config

## Mermaid ER-Diagramme

**⚠️ Nach jeder Model-Änderung müssen die ER-Diagramme aktualisiert werden!**

| Modell-Ordner | Diagramm |
|---------------|----------|
| `models/raw_vault/werkportal/` | `design/raw-vault/werkportal/er-diagram.mmd` |
| `models/raw_vault/adventureworks/` | `design/raw-vault/adventureworks/er-diagram.mmd` |
| `models/raw_vault/_common/` | `design/raw-vault/_common/er-diagram.mmd` |

### Format
```mermaid
erDiagram
    %%{init: {'theme': 'base'}}%%
    %% Schema: vault_<concept>
    
    HUB_ENTITY {
        char64 hk_entity PK
        bigint object_id
        datetime2 dss_load_date
        varchar dss_record_source
    }
    
    HUB_ENTITY ||--o{ SAT_ENTITY : has
```

### Regeln
- **Theme:** `base` (neutral, keine bunten Farben)
- **Dateiendung:** `.mmd`
- **Attribute:** `type name [PK|FK]` (keine Kommentare nach PK/FK)
- **Relationships:** Einfache Labels ohne Anführungszeichen

## Testing & Development Tools

### Database Access
- **Verwende `mssql_connect`** für Datenbankzugriff (nicht pyodbc oder Azure CLI)
- Server: `sql-datavault-weu-001.database.windows.net`
- Database: `Vault`
- Nach Connect: `mssql_run_query` für SQL-Abfragen

### UI Testing
- **Verwende Playwright MCP Tools** für Browser-Tests:
  - `mcp_playwright_browser_navigate` - Seite öffnen
  - `mcp_playwright_browser_snapshot` - Aktuelle Seite analysieren
  - `mcp_playwright_browser_click` - Element klicken
  - `mcp_playwright_browser_type` - Text eingeben
  - `mcp_playwright_browser_fill_form` - Formulare ausfüllen
- Dev Login: `admin@example.com` / `dev`
- App URL: `http://localhost:3000`

### MDS Bootstrap Testing
1. Drop alle MDS-Objekte (mssql_run_query)
2. `dbt run-operation bootstrap_mds --target local`
3. Verifiziere Tabellen (mssql_run_query)
4. Teste UI mit Playwright
