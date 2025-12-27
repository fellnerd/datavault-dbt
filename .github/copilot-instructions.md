# Copilot Instructions - Data Vault 2.1 dbt Project

## Project Overview
Multi-tenant Data Vault 2.1 on Azure SQL using dbt Core with `automate_dv` package. Single codebase deploys to isolated tenant databases via dbt targets.

## Architecture Flow
```
PostgreSQL → Synapse Pipeline → ADLS Parquet → External Table (stg.ext_*) → Staging View (stg.stg_*) → Hub/Sat/Link (vault.*)
```

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
| External Table | `stg.ext_<entity>` | `ext_company_client` |
| Staging View | `stg.stg_<entity>` | `stg_company_client` |
| Hub | `vault.hub_<entity>` | `hub_company_client` |
| Satellite | `vault.sat_<entity>` | `sat_company_client` |
| Link | `vault.link_<e1>_<e2>` | `link_company_country` |
| Hash Key | `hk_<entity>` | `hk_company_client` |
| Hash Diff | `hd_<entity>` | `hd_company_client` |
| Metadata | `dss_*` prefix | `dss_load_date`, `dss_record_source` |

## Hash Calculation (SQL Server Native)
Do NOT use automate_dv hash macros - they're incompatible with SQL Server. Use:
```sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', ISNULL(CAST(column AS NVARCHAR(MAX)), '')), 2)
```
See [stg_company_client.sql](models/staging/stg_company_client.sql) for the pattern.

## Adding a New Entity
1. **External Table:** Add to [sources.yml](models/staging/sources.yml) with full column definitions
2. **Staging View:** Create `models/staging/stg_<entity>.sql` with hash calculations
3. **Hub:** Create `models/raw_vault/hubs/hub_<entity>.sql` 
4. **Satellite:** Create `models/raw_vault/satellites/sat_<entity>.sql`
5. **Deploy:** `dbt run-operation stage_external_sources && dbt run --select stg_* hub_* sat_*`

## Key Files
- [dbt_project.yml](dbt_project.yml) - Model configs, schema assignments
- [models/staging/sources.yml](models/staging/sources.yml) - External table definitions (dbt-external-tables)
- [macros/generate_schema_name.sql](macros/generate_schema_name.sql) - Strips default schema prefix
- [LESSONS_LEARNED.md](LESSONS_LEARNED.md) - Troubleshooting & decisions
- [docs/](docs/) - System & user documentation

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
