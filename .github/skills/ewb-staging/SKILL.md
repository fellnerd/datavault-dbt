---
name: ewb-staging
description: "Vollständige Anleitung zum Erstellen eines EWB Staging-Modells mit automate_dv.stage() Macro. Deckt den gesamten Workflow ab: Parquet-Schema → Type-Korrektur → sources.yml → SQL-View → Tests → Entity-Designer JSON → Design-Doku → Deploy."
---

# EWB Staging Skill

## Wann verwenden?
Trigger-Phrasen:
- "Erstelle staging für ..."
- "Neues EWB Modell"
- "Add EWB parquet"
- "Staging für KRED/FIBU/PROJ/LOHN/PUBL ..."

## Goldene Referenz-Beispiele
- Single BK + Reserved Keyword: `models/staging/ewb_lohn_len_main.sql`
- Composite BK: `models/staging/ewb_proj_nsa_main.sql`
- Multiple Reserved Keywords: `models/staging/ewb_fibu_fhe_main.sql`

## Naming-Konvention
- Parquet: `ewb/abacus/<MODUL>.<TABELLE>.<SUFFIX>.parquet`
- External Table: `ext_ewb_<modul>_<tabelle>_<suffix>` (Schema: `stg`)
- Staging View: `ewb_<modul>_<tabelle>_<suffix>`
- Hash Key: `hk_<entity>`
- Hash Diff: `hd_<entity>`
- Record Source: `'ewb_abacus'`

## automate_dv.stage() YAML Metadata Pattern

Staging-Views verwenden das standardisierte automate_dv.stage() Macro. Hash-Berechnung erfolgt automatisch via Custom Overrides in `macros/hash_override.sql`.

### Vollständiges Template
```sql
/*
 * Staging Model: ewb_<modul>_<tabelle>_<suffix>
 *
 * Source: ext_ewb_<modul>_<tabelle>_<suffix> (Abacus <MODUL>.<TABELLE>.<SUFFIX>)
 * Business Key: <BK>
 * Hash Key: hk_<entity>
 * Payload: N Spalten — Beschreibung
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_<modul>_<tabelle>_<suffix>"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(<BK> AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "<RESERVED_KEYWORD>"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_<entity>: "<BK>"
  hd_<entity>:
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

### Wichtige Details
- **`_escape` derived column**: Fügt Spalten zu `columns_to_escape` hinzu (Reserved Keywords + Bindestriche)
- **`!` Prefix**: Literal-Werte in derived_columns (z.B. `"!ewb_abacus"`)
- **`include_source_columns=true`**: Alle Quellspalten werden durchgereicht
- **Hashdiff-Spalten**: Automatisch **alphabetisch sortiert** durch automate_dv
- **APPSTR-Spalten (VARBINARY)**: NICHT in hashed_columns aufnehmen
- **Date-Spalten in Hash Keys**: `CONVERT(NVARCHAR(30), <DATE_COL>, 126)` als derived column

### Composite BK Beispiel
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

## Type-Korrekturen (Bekannte Issues)

| Parquet/Macro-Typ | Korrekter SQL-Typ | Grund |
|---|---|---|
| `DECIMAL(38,10)` | `DECIMAL(38,18)` | Parquet numeric hat Scale 18 |
| `NVARCHAR(4000)` für APPSTR | `VARBINARY(8000)` | Binärdaten, nicht Text |
| `VARCHAR(n)` kurz | Prüfen ob ausreichend | Abacus hat teils lange Strings |

## Checklist für neue Staging-Modelle
1. [ ] `get_parquet_schema` ausgeführt
2. [ ] Types korrigiert (DECIMAL Scale, VARBINARY für APPSTR)
3. [ ] `sources.yml` Eintrag unter `# ===== EWB / ABACUS =====`
4. [ ] SQL-Datei mit automate_dv.stage() YAML Metadata Pattern erstellt
5. [ ] Reserved Keywords via `_escape` derived column escaped
6. [ ] APPSTR-Spalten (VARBINARY) NICHT in hashed_columns
7. [ ] `_staging__models.yml` Eintrag mit config.meta + Tests
8. [ ] `.vscode/entity-designer/<entity>.json` erstellt
9. [ ] `design/staging/ewb/<entity>.md` nach Template erstellt
10. [ ] `stage_external_sources` + `dbt run` erfolgreich
