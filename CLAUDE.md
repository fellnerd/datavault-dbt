# Memory

> Working memory for the productivity system. Deep knowledge lives in `memory/`.

## Me
Daniel Fellner — Data engineer. Builds and maintains the `datavault-dbt` project (Data Vault 2.1 on Azure SQL with dbt Core). Commits under ppmc (daniel.fellner@ppmcag.com) and dimetrics.io. GitHub: fellnerd.

## Terms
| Term | Meaning |
|------|---------|
| DV / DV 2.1 | Data Vault 2.1 — the modeling methodology this project implements |
| Hub / Sat / Link | Data Vault core objects: business keys / descriptive history / relationships |
| automate_dv | dbt package generating Hub/Sat/Link SQL (our macros take dispatch priority) |
| PSA | Persistent Staging Area (source for incremental HWM seeks) |
| HWM | High Water Mark — incremental cutoff via `dss_load_date` index |
| CDR | Call Detail Record (telecom domain) |
| MSISDN | Mobile phone number = "Rufnummer" (telecom) |
| Vertrag | Contract |
| ADLS | Azure Data Lake Storage Gen2 (Parquet landing zone) |
| Synapse | Azure Synapse pipeline (PostgreSQL → Parquet ingestion) |
| IDMS | A source system (e.g. internet service data) |
| EWB | Production tenant/customer (db `datavault`; payroll = "Lohn" data) |
| PBI | Power BI (DirectQuery marts; Zebra BI visuals) |
| stg.ext_* / stg.stg_* | External Tables / Staging Views |
| dss_load_date / dss_record_source | DV metadata columns (load date / record source) |

## Projects
| Name | What |
|------|------|
| **datavault-dbt** | Multi-tenant Data Vault 2.1 on Azure SQL via dbt Core. Flow: PostgreSQL → Synapse → ADLS Parquet → External Table → Staging View → Hub/Sat/Link → Marts. |
| **vault_telecom** | New business concept for telecom (CDR/MSISDN). hub_msisdn confirmed M:N to Vertrag. |
| **datavault-agent** | Submodule (github fellnerd/datavault-agent). |
| **parquet-ingestion** | Submodule (github fellnerd/parquet-ingestion-func). |

## Tenants (dbt targets)
| Target | Database | Use |
|--------|----------|-----|
| `dev` | Vault | Development (current branch: dev) |
| `jira` | Vault_Jira | Production tenant 1 |
| `ewb` | datavault | Production EWB |

## Domains (model folders)
- **finance** (`mart_finance`): dim_konto, fakt_buchungen — Power BI / Zebra BI
- **telecom** (`vault_telecom`, `mart_telecom`): CDR, sat_cdr_event, hub_msisdn
- **idms** (`raw_vault/idms`): internet service satellites
- **ewb** (`raw_vault/ewb`): Lohn/LTC funktion, dim_person_funktion
- **project** (`mart/project`)

## Preferences
- Concise and direct; minimal explanation, no filler. (Confirmed.)
- Tasks live in **Jira** (connector not yet linked — TASKS.md syncs once connected).
- German is the working language for docs and commit messages.

## Config notes
- Hashing: SHA, `concat_string` `||`, null placeholder `-1`, casing DISABLED.
- SQL Server reserved keywords escaped with `[ ]` — watch hyphenated/reserved column names.
