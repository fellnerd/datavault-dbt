# Project — datavault-dbt

Multi-tenant **Data Vault 2.1** on **Azure SQL** built with **dbt Core** (project name `datavault`, profile `datavault`).

## Data flow
```
PostgreSQL → Synapse Pipeline → ADLS Parquet → External Table → Staging View → Hub/Sat/Link → Marts
                                                (stg.ext_*)      (stg.stg_*)    (vault*.*)    (mart*.*)
```

## Layers
- `models/staging` — schema `stg`, materialized as views
- `models/raw_vault` — Hubs/Sats/Links; `_common` (schema `vault`) + source-specific (`ewb`, `idms`, `telecom`)
- `models/business_vault` — derived vault objects
- `models/mart` — BI consumption: `_common`, `finance`, `project`, `telecom`
- `models/utils`

## Tenants (dbt targets)
| Target | DB | Use |
|--------|----|-----|
| dev | Vault | development |
| jira | Vault_Jira | production tenant 1 |
| ewb | datavault | production EWB |

## Key config (dbt_project.yml vars)
- `hash: SHA`, `concat_string: ||`, `null_placeholder_string: -1`, `hash_content_casing: DISABLED`
- `load_date: dss_load_date`, `record_source: dss_record_source`
- SQL Server reserved-keyword escaping: `[` / `]`
- `automate_dv` dispatch: project macros take precedence
- `stage_fs_sas` via `env_var('STAGE_FS_SAS')` for listing Parquet files

## Submodules
- `agent` → github fellnerd/datavault-agent
- `parquet-ingestion` → github fellnerd/parquet-ingestion-func

## Active threads (from ISSUES.md + recent commits)
- **CDR / vault_telecom**: `hub_msisdn` stays — analysis confirmed real M:N between Rufnummer and Vertrag (33 numbers on multiple contracts in same snapshot; 83 contracts with >1 number → SIM-Wechsel/Multi-SIM). New business concept `vault_telecom`.
- **CDR performance**: custom incremental `sat_cdr_event` (1.7s vs 45+ min via anti-join removal); `dss_load_date` index on PSA + Sat for HWM seek; CI timeout raised to 3h.
- **Finance marts**: `dim_konto` fixes (encoding/UNION/sort + summary plug rows for Zebra BI); `fakt_buchungen` materialized as table for PBI DirectQuery performance.
- **EWB**: `ewb_lohn_ltc_funktion` staging view; `dim_person_funktion_v` + `ref_funktion_v`. Watch reserved/hyphenated columns (e.g. `TIMESTAMP_LANDING-ZONE`, `[end]`, `[start]`).

## Ops
- CI: GitLab (`.gitlab-ci.yml`) + GitHub Actions (`.github/`)
- Repo: github.com/fellnerd/datavault-dbt; current branch `dev`
- Docs in `docs/` (incl. Power BI optimization plan, EWB training plan)
