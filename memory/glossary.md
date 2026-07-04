# Glossary — decoder ring

Acronyms, domain terms, and shorthand used in `datavault-dbt`. Update as new terms appear.

## Data Vault / dbt
| Term | Meaning |
|------|---------|
| DV / DV 2.1 | Data Vault 2.1 modeling methodology |
| Hub | Table of unique business keys |
| Sat (Satellite) | Descriptive, historised attributes for a Hub or Link |
| Link | Relationship between Hubs (M:N capable) |
| Raw Vault | Hubs/Sats/Links loaded directly from source (`models/raw_vault`) |
| Business Vault | Derived/computed vault objects (`models/business_vault`) |
| Mart | Consumption layer for BI (`models/mart`) |
| automate_dv | dbt package generating DV SQL; project macros override via `dispatch` |
| PSA | Persistent Staging Area |
| HWM | High Water Mark — incremental load cutoff (seeks `dss_load_date` index) |
| dss_load_date | DV metadata: load timestamp column |
| dss_record_source | DV metadata: record source column |
| Hashdiff | Hash of satellite payload to detect change |
| `_common` | Cross-source vault/mart objects (schema `vault` / `mart`) |

## Schema naming convention
| Pattern | Meaning |
|---------|---------|
| `stg.ext_<entity>` | External Table over ADLS Parquet |
| `stg.stg_<entity>` | Staging View |
| `vault.<hub|sat|link>_<entity>` | Cross-source vault objects (`_common`) |
| `vault_<concept>.<...>` | Source/domain-specific vault objects |
| `mart.<object>` | Cross-source mart objects |
| `mart_<concept>.<object>` | Domain-specific mart objects |

## Domain terms (German / telecom / finance)
| Term | Meaning |
|------|---------|
| Rufnummer | Phone number → MSISDN |
| MSISDN | Mobile phone number (telecom business key) |
| Vertrag | Contract |
| CDR | Call Detail Record |
| Lohn | Payroll / wage (EWB domain) |
| LTC | Appears in `ewb_lohn_ltc_funktion` (EWB payroll function) |
| Konto | Account (finance: dim_konto) |
| Buchung | Booking/posting (finance: fakt_buchungen) |
| Funktion | Function/role (dim_person_funktion) |

## Platform / tooling
| Term | Meaning |
|------|---------|
| ADLS | Azure Data Lake Storage Gen2 (Parquet landing) |
| Synapse | Azure Synapse pipeline (PostgreSQL → Parquet) |
| External Table | SQL Server external table over Parquet (stg.ext_*) |
| IDMS | Source system (internet service data) |
| PBI | Power BI |
| Zebra BI | Power BI visual library (marts shaped for it) |
| DirectQuery | Power BI live-query mode (drives table materialization choices) |
| SAS / STAGE_FS_SAS | Azure SAS token for listing Parquet files |

## Tenants
| Term | Meaning |
|------|---------|
| dev | Dev target → DB `Vault` |
| jira | Production tenant 1 → DB `Vault_Jira` |
| EWB | Production tenant → DB `datavault` |
