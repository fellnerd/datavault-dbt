---
applyTo: 'models/**'
---
# Data Vault 2.1 — Development Principles

Quelle: `azure-environment/docs/dv21-konzept/DEVELOPER.md`

## Entscheidungslogik: Welches DV-Objekt?

```
Gibt es einen stabilen Business Key?
└─ JA → HUB

Ändern sich Attribute über Zeit?
└─ JA → SATELLITE

Beschreibt es eine Beziehung zwischen Objekten?
└─ JA → LINK
└─ Hat die Beziehung eigene Attribute? → LINK SATELLITE

Mehrere Werte ohne eigene Identität (z.B. Ansprechpartner)?
└─ JA → DEPENDENT CHILD SATELLITE (am Link)

Mehrere Werte gleichzeitig gültig (z.B. mehrere Rollen)?
└─ JA → MULTI-ACTIVE SATELLITE (am Hub, mit src_cdk)

Stabile Lookup-Werte (Länder, Status)?
└─ JA → REFERENCE TABLE (kein Hub!)

Unveränderliche Ereignis-Daten (CDR, Transaktionen)?
└─ JA → TRANSACTION LINK (_tl Suffix, Non-Historized)

Performance-Problem bei Zeitabfragen?
└─ JA → PIT TABLE (nur bei Bedarf)
```

## Pflicht-Felder pro Objekttyp

### Hub
```
hk_<entity>           -- Hash Key (PK), SHA2_256, CHAR(64)
<business_key>        -- Business Key (original)
dss_business_key      -- Normierter Business Key (CONCAT_WS-basiert)
dss_load_date         -- Ladezeitpunkt, DATETIME2
dss_create_datetime   -- Erstellungszeitpunkt, DATETIME2
dss_record_source     -- Quelle, VARCHAR(100)
```

### Satellite
```
hk_<entity>           -- Hash Key (FK zum Hub), PK Teil 1
dss_load_date         -- Ladezeitpunkt, PK Teil 2
hd_<entity>           -- Hash Diff (Änderungserkennung)
<attribute_1..n>      -- Fachliche Attribute
dss_create_datetime   -- Erstellungszeitpunkt, DATETIME2
dss_record_source     -- Quelle
dss_is_current        -- 'Y' = aktuell, 'N' = historisch (via post_hook)
dss_end_date          -- Gültigkeitsende, NULL = aktuell (via post_hook)
```

### Link
```
hk_link_<e1>_<e2>    -- Link Hash Key (PK)
hk_<entity_1>        -- FK zu Hub 1
hk_<entity_2>        -- FK zu Hub 2
dss_load_date         -- Ladezeitpunkt
dss_record_source     -- Quelle
```

### DC Satellite (am Link)
```
hk_link_<dc>_<parent> -- FK zum Link (PK Teil 1)
dss_load_date          -- PK Teil 2
hd_<dc>_<parent>_dc   -- Hash Diff
<dck_columns>          -- Dependent Child Keys (im Payload)
<attributes>           -- Weitere Attribute
```

### MA Satellite (am Hub)
> **Naming:** `sat_<entity>_ma__<source>` — `_ma` Suffix VOR dem `__source` Suffix. Beispiel: `sat_vertrag_optionen_ma__compax`
```
hk_<entity>           -- FK zum Hub (PK Teil 1)
dss_load_date         -- PK Teil 2
<cdk_columns>          -- Child Dependent Keys (unterscheidet Records)
hd_<entity>_ma        -- Hash Diff
<attributes>           -- Attribute
```

## Naming Conventions

### Standard Satellite
`sat_<entity>__<source>` — doppelter Unterstrich vor Quellsystem-Suffix

### MA Satellite (Multi-Active)
`sat_<entity>_ma__<source>` — `_ma` Suffix VOR dem `__<source>` Doppelunterstrich
- Hash Diff: `hd_<entity>_ma`
- Beispiel: `sat_vertrag_optionen_ma__compax`

### Transaction Link (TL)
`link_<entity>_tl` — `_tl` Suffix kennzeichnet Non-Historized Transaction Link
- Hash Key: `hk_link_<entity>_tl`
- **Kein Hash Diff** — Transaktionsdaten sind unveränderlich
- **Kein `dss_is_current` / `dss_end_date`** — Non-Historized
- Dazugehöriger Transaction Satellite: `sat_<entity>__<source>` (ebenfalls Non-Historized)
- Beispiel: `link_cdr_event_tl`, `hk_link_cdr_event_tl`

### DC Satellite
`sat_<entity>_dc__<source>` — `_dc` Suffix (analog zu `_ma`)

### Quelle / Source Suffix
- `__<source>` Doppelunterstrich-Suffix auf **Satellites** (nicht auf Hubs/Links)
- Beispiele: `__abacus`, `__compax`, `__jira`
- Hubs und Links haben keinen Source-Suffix (source-agnostisch)

### Transaction Link (Non-Historized Link)
Für unveränderliche Ereignis-Daten (CDR-Events, Transaktionen). Kein Hash Diff, kein SCD2.
> **Naming:** `link_<entity>_tl` — `_tl` Suffix, **KEIN** `__source` Suffix
> **Kein Hash Diff** — Events ändern sich nie (Non-Historized)
> **Kein dss_is_current / dss_end_date**
```
hk_link_<entity>_tl  -- Transaction Link Hash Key (PK)
hk_<entity_1>        -- FK zu Hub 1
hk_<entity_2>        -- FK zu Hub 2
dss_load_date         -- Ladezeitpunkt
dss_record_source     -- Quelle
```

## Satellite-Schnitt Regeln
- **1 Thema = 1 Satellite** — Gruppiere nach fachlicher Zusammengehörigkeit
- **Nach Änderungsfrequenz schneiden** — Häufig vs. selten ändernde Attribute trennen
- **Stammdaten** → eigener Satellite (z.B. `sat_kunde`)
- **Transaktionsdaten** → eigener Satellite (z.B. `sat_buchung`)
- **System-Metadaten** (CREUSER, MUTUSER, etc.) → ggf. eigener Satellite oder im Haupt-Satellite

## Hash-Berechnung im Staging (automate_dv.stage())

Staging-Modelle verwenden das **automate_dv.stage()** Macro mit YAML-Metadaten. Hash Keys und Hash Diffs werden automatisch berechnet.

- **Custom Overrides** in `macros/hash_override.sql`:
  - `sqlserver__cast_binary` → `CHAR(64)` hex-encoded (statt `BINARY(32)`)
  - `sqlserver__type_string` → `NVARCHAR` (Unicode-safe)
- **NULL-Handling:** `'-1'` als Null-Placeholder (konfiguriert in dbt_project.yml `null_placeholder_string`)
- **Trimming:** `LTRIM(RTRIM(...))` wird automatisch von automate_dv angewendet
- **Hash content casing:** `DISABLED` (kein `UPPER()` — case-sensitive Daten)
- **Concat separator:** `'||'` (konfiguriert in dbt_project.yml `concat_string`)
- **Hashdiff-Spalten** werden automatisch **alphabetisch sortiert** durch automate_dv
- **dss_business_key** = `CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(BK AS NVARCHAR(MAX)))), '-1'))`
- **dss_create_datetime** = `GETDATE()`

### Staging-Pattern (automate_dv.stage() YAML Metadata)

**Single Business Key** (Referenz: `models/staging/ewb_lohn_len_main.sql`):
```sql
{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_lohn_len_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(EMPL_NR AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "TYPE"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_person: "EMPL_NR"
  hd_person:
    is_hashdiff: true
    columns:
      - "COL1"
      - "COL2"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
```

**Composite Business Key** (Referenz: `models/staging/ewb_proj_nsa_main.sql`):
```yaml
hashed_columns:
  hk_projektsachkonto:
    - "PROJNR"
    - "CODE"
    - "PERIYEAR"
    - "PERIMONTH"
    - "GB"
    - "DATASET"
```

### Escaping von Reserved Keywords

Verwende `_escape` als derived column mit `source_column` Liste + `escape: true`. Dies fügt die Spalten zu `columns_to_escape` hinzu, ohne problematische Aliase zu erzeugen:
```yaml
derived_columns:
  _escape:
    source_column:
      - "PLAN"
      - "LEVEL"
      - "BEFORE"
      - "AFTER"
      - "timestamp_landing-zone"
    escape: true
```
Referenz: `models/staging/ewb_fibu_fhe_main.sql` (multiple reserved keywords)

### Date-Spalten in Hash Keys

Für deterministische ISO-Datums-Hashing verwende derived columns:
```yaml
derived_columns:
  PROJDAT_KEY: "CONVERT(NVARCHAR(30), PROJDAT, 126)"
```

## automate_dv Macros (Vault-Schicht)
- Hub: `automate_dv.hub(src_pk, src_nk, src_ldts, src_source, source_model, src_extra_columns)`
- Satellite: `automate_dv.sat(src_pk, src_hashdiff, src_payload, src_ldts, src_source, source_model, src_extra_columns)`
- Link: `automate_dv.link(src_pk, src_fk, src_ldts, src_source, source_model)`
- MA Satellite: `automate_dv.ma_sat(src_pk, src_cdk, src_hashdiff, src_payload, src_eff, src_ldts, src_source, source_model)`

### Hub Extra Columns
Hubs erhalten `dss_business_key` und `dss_create_datetime` als Extra-Spalten:
```yaml
src_extra_columns:
  - "dss_business_key"
  - "dss_create_datetime"
```

### Satellite Extra Columns
Satellites erhalten `dss_create_datetime` als Extra-Spalte (kein `src_eff`):
```yaml
src_extra_columns:
  - "dss_create_datetime"
```

### Hashdiff-Alias Konvention
```yaml
src_hashdiff:
  source_column: "hd_<entity>"   # Name im Staging
  alias: "HASHDIFF"              # IMMER "HASHDIFF" als Alias (uppercase)
```

## Modell-Konfiguration (config Block)
```sql
{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[...]
) }}
```
- `materialized='incremental'` für alle Vault-Objekte (Hub, Sat, Link)
- `as_columnstore=false` — Pflicht bei Azure SQL Serverless
- `post_hook` — Performance-Indexe (siehe sql-server.instructions.md)

## Inline YAML Metadata Pattern
Vault-Modelle verwenden ein Inline-YAML-Pattern mit `fromyaml()`:

### Hub Metadata
```sql
{%- set yaml_metadata -%}
source_model: "<staging_model>"
src_pk: "hk_<entity>"
src_nk: "<business_key>"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
src_extra_columns:
  - "dss_business_key"
  - "dss_create_datetime"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}
{{ automate_dv.hub(src_pk=metadata_dict["src_pk"], src_nk=metadata_dict["src_nk"], src_ldts=metadata_dict["src_ldts"], src_source=metadata_dict["src_source"], src_extra_columns=metadata_dict["src_extra_columns"], source_model=metadata_dict["source_model"]) }}
```

### Satellite Metadata
```sql
{%- set yaml_metadata -%}
source_model: "<staging_model>"
src_pk: "hk_<entity>"
src_hashdiff:
  source_column: "hd_<entity>"
  alias: "HASHDIFF"
src_payload:
  - "<attribute_1>"
  - "<attribute_n>"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
src_extra_columns:
  - "dss_create_datetime"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}
{{ automate_dv.sat(src_pk=metadata_dict["src_pk"], src_hashdiff=metadata_dict["src_hashdiff"], src_payload=metadata_dict["src_payload"], src_ldts=metadata_dict["src_ldts"], src_source=metadata_dict["src_source"], src_extra_columns=metadata_dict["src_extra_columns"], source_model=metadata_dict["source_model"]) }}
```

## Current Views (sat_*_current_v)

Für jeden Satellite wird eine Current View erstellt, die den aktuellen Stand (SCD1) oder die volle Historie (SCD2) bereitstellt.

### Pattern
```
models/raw_vault/_common/satellites/sat_<entity>_current_v.sql
```

### Verwendung
```sql
{{ config(materialized='view') }}
{{ satellite_current_view(
    satellite_model='sat_<entity>',
    hashkey_column='hk_<entity>'
) }}
```

- **SCD1 (aktueller Stand):** `WHERE dss_is_current = 'Y'` — Standard-Filter
- **SCD2 (volle Historie):** Kein Filter, alle Records
- Mart-Modelle referenzieren `*_current_v` Views statt Satellites direkt

## Mart Layer — Dimensionale Modellierung

### Surrogate Key Macro
Mart-Dimensionen verwenden das `surrogate_key()` Macro für deterministische BIGINT Keys:
```sql
{{ surrogate_key('business_key_column') }} AS {dim}_key
-- Generiert: ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(column AS NVARCHAR(MAX)))))
```

### Dimension Pflicht-Spalten
```
{dim}_key             -- Surrogate Key (PK), BIGINT, via surrogate_key() Macro
{dim}_id              -- Technische ID, NVARCHAR(255)
{dim}_code            -- Sprechender Schluessel, NVARCHAR(255), Fallback = ID
{dim}_name            -- Bezeichnung, NVARCHAR(255), Fallback = CODE oder 'UNKNOWN'
dss_load_date         -- Ladezeitpunkt, DATETIME2
dss_record_source     -- Quellenidentifikation, NVARCHAR(255)
```

### Faktentabelle Pflicht-Spalten
```
{dim}_key             -- FK zur Dimension, BIGINT, via surrogate_key() (gleicher Aufruf!)
<measures>            -- Fachliche Kennzahlen
dss_load_date         -- Ladezeitpunkt, DATETIME2
dss_record_source     -- Quellenidentifikation, NVARCHAR(255)
```

### Materialisierung
- `materialized='view'` — Standard (Virtualisierung bevorzugt)
- `materialized='table'` — Nur bei Performance-Problemen; wenn verwendet, **muss** eine 1:1 Wrapper-View existieren (siehe `dbt-mart.instructions.md`)
