---
name: ewb-staging
description: "Vollständige Anleitung zum Erstellen eines EWB Staging-Modells aus einer Abacus Parquet-Datei. Deckt den gesamten Workflow ab: Parquet-Schema → Type-Korrektur → sources.yml → SQL-View → Tests → Entity-Designer JSON → Design-Doku → Deploy."
---

# EWB Staging Skill

## Wann verwenden?
Trigger-Phrasen:
- "Erstelle staging für ..."
- "Neues EWB Modell"
- "Add EWB parquet"
- "Staging für KRED/FIBU/PROJ/LOHN/PUBL ..."

## Goldenes Referenz-Beispiel
`models/staging/ewb_fibu_fhe_main.sql` — Erstes vollständiges EWB Staging-Modell.
Adworks-Vorlage: `models/staging/adworks_kunde.sql`

## Naming-Konvention
- Parquet: `ewb/abacus/<MODUL>.<TABELLE>.<SUFFIX>.parquet`
- External Table: `ext_ewb_<modul>_<tabelle>_<suffix>` (Schema: `stg`)
- Staging View: `ewb_<modul>_<tabelle>_<suffix>`
- Hash Key: `hk_ewb_<entity>`
- Hash Diff: `hd_ewb_<entity>`
- Record Source: `'ewb_abacus'`

## 5-Block-Staging-Struktur

### Block 1: Header-Kommentar
```sql
{#
    Staging Model: ewb_<modul>_<tabelle>_<suffix>
    Source: Abacus ERP - <Modul>.<Tabelle>.<Suffix>
    Business Key: RECNUM (o.ä.)
    Hash Key: hk_ewb_<entity>
    Hash Diff: hd_ewb_<entity>
    Record Source: ewb_abacus

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   <YYYY-MM-DD> V1.0 Initialversion
#}
```

### Block 2: hashdiff_columns (Jinja Variable)
```sql
{%- set hashdiff_columns = [
    'SPALTE_1',
    'SPALTE_2',
    -- KEINE VARBINARY-Spalten (APPSTRx)!
    -- KEINE APPGUID-Spalten!
] -%}
```

### Block 3: source CTE
```sql
WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_ewb_<modul>_<tabelle>_<suffix>') }}
),
```

### Block 4: staged CTE
```sql
staged AS (
    SELECT
        -- Hash Key (Entity)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            ISNULL(CAST(RECNUM AS NVARCHAR(MAX)), '')
        ), 2) AS hk_ewb_<entity>,

        -- Hash Diff (Change Detection)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256',
            {% for col in hashdiff_columns %}
            ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), '')
            {% if not loop.last %} + '^^' + {% endif %}
            {% endfor %}
        ), 2) AS hd_ewb_<entity>,

        -- Business Key
        RECNUM,

        -- Attributes / Payload
        SPALTE_1,
        SPALTE_2,
        [PLAN],     -- Reserved Keywords escapen!
        [LEVEL],

        -- Metadata
        CAST('ewb_abacus' AS VARCHAR(50)) AS dss_record_source,
        CAST(GETDATE() AS DATETIME2(6)) AS dss_load_date,
        CAST(NULL AS DATETIME2(6)) AS dss_start_date,
        CAST(GETDATE() AS DATETIME2(6)) AS dss_create_date
    FROM source
)
```

### Block 5: Output
```sql
SELECT * FROM staged
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
4. [ ] SQL-Datei mit 5-Block-Struktur erstellt
5. [ ] Reserved Keywords escaped: `[PLAN]`, `[LEVEL]`, `[KEY]`, `[STATUS]`, `[TYPE]`, `[ORDER]`, `[GROUP]`, `[INDEX]`, `[BEFORE]`, `[AFTER]`
6. [ ] APPSTR-Spalten (VARBINARY) NICHT in hashdiff_columns
7. [ ] `_staging__models.yml` Eintrag mit config.meta + Tests
8. [ ] `.vscode/entity-designer/<entity>.json` erstellt
9. [ ] `design/staging/ewb/<entity>.md` nach Template erstellt
10. [ ] `stage_external_sources` + `dbt run` erfolgreich
