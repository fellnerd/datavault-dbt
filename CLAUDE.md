# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Data Vault 2.1 implementation on Azure SQL Server using dbt. Source data flows from Abacus ERP (EWB) and other systems as Parquet files via Azure Data Factory → ADLS Gen2 → External Tables → dbt models → Raw Vault → Mart.

**Full data flow:**
```
ADLS Parquet → stg.ext_ewb_* (External Table) → stg.ewb_* (Staging View) → vault.* (Hub/Sat/Link) → vault.sat_*_current_v (Current View) → mart_* (Dim/Fakt)
```

## Commands

### Setup
```bash
python3 -m venv .venv && source .venv/bin/activate
pip install dbt-core dbt-sqlserver
dbt deps
dbt debug   # verify DB connection
```

### Development
```bash
dbt run                                        # all models
dbt run --select hub_company_client            # single model
dbt run --select +sat_company_client+          # with dependencies
dbt test                                       # all tests
dbt test --select hub_company_client           # single model tests
dbt compile --select model_name                # compile without execute
dbt run-operation stage_external_sources       # create/refresh external tables
```

### Ad-hoc SQL Queries (Database Explorer)
```bash
source .env  # loads DBT_EWB_SQL_PASSWORD
dbt run-operation run_sql --args '{"sql": "SELECT TOP 10 * FROM stg.ext_ewb_fibu_gl_e25"}' --target ewb-dev
```

The `run_sql` macro (`macros/run_sql.sql`) executes any arbitrary SQL against Azure SQL and prints results as a table. Use this for:
- Schema exploration (`INFORMATION_SCHEMA.COLUMNS`)
- Data profiling and validation
- Answering design questions with real data
- Debugging staging views and vault models

**Important:** Always `source .env` first to load `DBT_EWB_SQL_PASSWORD`. The `.env` file is in `.gitignore` and must never be committed.

### Targets
```bash
dbt run --target ewb-dev    # development (default)
dbt run --target ewb-test   # test
dbt run --target ewb        # production
```

> **WARNING:** Never run `dbt run --full-refresh` without explicit user confirmation — it destroys history in incremental tables.

## Architecture

### Layer → Schema → Folder Mapping

| Layer | Schema | Folder | Materialization |
|-------|--------|--------|-----------------|
| External Tables | `stg` | `staging/` (sources.yml) | External |
| Staging Views | `stg` | `models/staging/` | View |
| Raw Vault (EWB + common) | `vault` | `models/raw_vault/_common/` | Incremental (append) |
| Raw Vault (Jira) | `vault_jira` | `models/raw_vault/jira/` | Incremental (append) |
| Business Vault (PITs, bridges) | `vault` | `models/business_vault/` | Table |
| Mart (common) | `mart` | `models/mart/_common/` | View |
| Mart (domain) | `mart_<concept>` | `models/mart/<concept>/` | View |

All Raw Vault objects use `incremental_strategy: append` with `on_schema_change: append_new_columns` (Data Vault immutability + Azure SQL Basic tier constraint).

### Naming Conventions (EWB)

| Object | Pattern | Example |
|--------|---------|---------|
| External Table | `stg.ext_ewb_<modul>_<tabelle>` | `stg.ext_ewb_fibu_fhe_main` |
| Staging View | `stg.ewb_<modul>_<tabelle>` | `stg.ewb_fibu_fhe_main` |
| Hash Key | `hk_<entity>` | `hk_buchungskopf` |
| Hash Diff | `hd_<entity>` | `hd_buchungskopf` |
| Hub | `vault.hub_<entity>` | `vault.hub_fibu_fhe` |
| Satellite | `vault.sat_<entity>` | `vault.sat_fibu_fhe` |
| Link | `vault.link_<e1>_<e2>` | `vault.link_beleg_lieferant` |
| Mart view | `mart.v_<descriptive>` | `mart.v_fibu_buchungen` |
| Dimension | `mart_<concept>.dim_<entity>` | `mart_project.dim_person` |
| Fact table | `mart_<concept>.fakt_<content>` | `mart_project.fakt_stunden` |

Standard metadata columns: `dss_load_date`, `dss_record_source`, `dss_run_id`, `dss_is_current`, `dss_end_date`, `dss_business_key`, `dss_create_datetime`.
`dss_record_source = 'ewb_abacus'` for all EWB objects.

### Additional Staging Columns
- `dss_business_key` — Normalized business key: `CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(BK AS NVARCHAR(MAX)))), '-1'))`
- `dss_create_datetime` — Row creation timestamp: `GETDATE()`

### DV 2.1 Object Decision Logic

```
Stable business key?                    → HUB
Attributes that change over time?       → SATELLITE (attached to hub)
Relationship between entities?          → LINK
Relationship without own business key?  → DC SATELLITE (attached to link)
Multiple simultaneously valid values?   → MA SATELLITE (hub, src_cdk column)
Stable lookup values?                   → REFERENCE TABLE
```

## Azure SQL Critical Constraints

1. **Always** `as_columnstore: false` on incremental models (Basic tier limitation)
2. **Never** hardcode database names — use `{{ target.database }}`
3. **Hashing via automate_dv.stage()** with custom overrides in `macros/hash_override.sql`:
   - `sqlserver__cast_binary` — produces `CHAR(64)` hex-encoded hashes (instead of automate_dv's default `BINARY(32)`)
   - `sqlserver__type_string` — returns `NVARCHAR` (Unicode-safe for Swiss data with Umlauts)
   - Configured via `dispatch` in `dbt_project.yml` to prioritize project macros over automate_dv
4. **Null placeholder:** `'-1'` (configured as `null_placeholder_string` in dbt_project.yml vars)
5. **Hash content casing:** `DISABLED` (no `UPPER()` on hash inputs — case-sensitive data)
6. **Concat string:** `'||'` as multi-column hash separator

## Custom Macros (macros/)

- `hash_override.sql` — Overrides `automate_dv.cast_binary` (→ `CHAR(64)`) and `automate_dv.type_string` (→ `NVARCHAR`)
- `generate_schema_name.sql` — Overrides dbt-sqlserver schema naming
- `stage_external_sources_selective.sql` — Creates individual external tables from sources.yml
- `satellite_current_flag.sql` — Post-hook: updates `dss_is_current` flag
- `satellite_current_view.sql` — Generates `sat_*_current_v` views (SCD1/SCD2 access pattern)
- `create_hash_index.sql` — Post-hook: creates indexes on hash key columns
- `get_parquet_schema.sql` / `get_parquet_data.sql` / `list_parquet_files.sql` — ADLS Parquet introspection
- `run_sql.sql` — **Ad-hoc SQL runner** for arbitrary queries against Azure SQL (use with `dbt run-operation run_sql --args '{"sql": "..."}'`)
- `surrogate_key.sql` — **Mart surrogate key**: `ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(col AS NVARCHAR(MAX)))))` — deterministic BIGINT for dim PKs and fact FKs

## Skills (Slash Commands)

Use these skills for common DV workflows:
- `/datavault:new-entity` — Full workflow: staging + hub + satellite + deploy
- `/datavault:create-staging` — Create staging view + optional external table
- `/datavault:create-hub` — Create hub model
- `/datavault:create-satellite` — Create satellite model
- `/datavault:create-link` — Create link model
- `/datavault:create-mart` — Create mart view
- `/datavault:dbt-run` — Run dbt with formatted output
- `/datavault:db-query` — Run SQL query against Azure SQL
- `/datavault:validate` — Validate a dbt model

## Profiles (~/.dbt/profiles.yml)

Not in repo. All targets connect to `sql-analytics-ewb-001.database.windows.net`. Azure CLI auth (recommended):
```yaml
datavault:
  target: ewb-dev
  outputs:
    ewb-dev:
      type: sqlserver
      driver: 'ODBC Driver 18 for SQL Server'
      server: sql-analytics-ewb-001.database.windows.net
      port: 1433
      database: datavault-dev
      schema: dv
      authentication: cli
      encrypt: true
      trust_cert: false
    ewb-test:
      type: sqlserver
      driver: 'ODBC Driver 18 for SQL Server'
      server: sql-analytics-ewb-001.database.windows.net
      port: 1433
      database: datavault-test
      schema: dv
      authentication: cli
      encrypt: true
      trust_cert: false
    ewb:
      type: sqlserver
      driver: 'ODBC Driver 18 for SQL Server'
      server: sql-analytics-ewb-001.database.windows.net
      port: 1433
      database: datavault
      schema: dv
      authentication: cli
      encrypt: true
      trust_cert: false
```

## MCP Server

A custom MCP server (`datavault-agent`) runs on `http://10.0.0.25:3001`. See `docs/CLAUDE.md` for full tool reference and interaction workflow guidelines.

## Key Documentation

- `docs/CLAUDE.md` — Interaction style, MCP tool rules, workflow guidelines
- `docs/DEVELOPER.md` — Entity creation walkthroughs, object templates
- `docs/LESSONS_LEARNED.md` — Design decisions and known issues
- `docs/MODEL_ARCHITECTURE.md` — Schema conventions, ER diagrams
- `.github/copilot-instructions.md` — Agent delegation, naming, Azure SQL rules
