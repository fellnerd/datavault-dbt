# Create Mart Object (Dimension / Faktentabelle)

Creates dimensional model objects for the DataHub/IMS layer: Dimensions from PIT tables, Faktentabellen from Bridge tables, and Flat Tables for exports.

## When to Use

- Creating a **Dimension** for reporting (from Hub + Satellite data)
- Creating a **Faktentabelle** (measures from Link + Satellite data)
- Building a **Flat Table** for data export
- Setting up PIT or Bridge tables as preparation

## Prerequisites

- Raw Vault objects exist (Hubs, Satellites, Links)
- Current Views exist for all relevant Satellites
- Business requirements for the dimension/fact are clear
- Target concept/domain is identified

## Step-by-Step Workflow

### 1. Determine Object Type

| Type | Source | Template | Naming |
|------|--------|----------|--------|
| Dimension | Hub + Sat Current View | `templates/dim.sql` | `dim_{entity}` |
| Faktentabelle | Link + Sat Current View | `templates/fakt.sql` | `fakt_{content}` |
| Flat Table | Multiple sources | Custom | `{content}` |
| PIT | Hub + Satellites (history) | Custom | `pit_{hub}` |
| Bridge | Links (multi-hop) | Custom | `bridge_{content}` |

### 2. Create Dimension

File: `models/mart/<concept>/dim_<entity>.sql`

```sql
{{ config(materialized='view') }}

SELECT
    -- Pflicht-Spalten (Confluence §13)
    hk_<entity>                                              AS <entity>_key,
    <source_id>                                              AS <entity>_id,
    ISNULL(<source_code>, CAST(<source_id> AS NVARCHAR(255))) AS <entity>_code,
    ISNULL(<source_name>, ISNULL(<source_code>, 'UNKNOWN'))  AS <entity>_name,
    
    -- Weitere Attribute
    <attr1>,
    <attr2>,
    
    -- Referenzierte Dimensionen (Snowflaking)
    ISNULL(ref_dim.hk_<ref>, '-1')         AS <ref>_key,
    ISNULL(ref_dim.<ref>_id, '-1')         AS <ref>_id,
    ISNULL(ref_dim.<ref>_code, 'UNKNOWN')  AS <ref>_code,
    
    -- Metadata
    sat.dss_load_date,
    sat.dss_record_source
FROM {{ ref('sat_<entity>__<system>_current_v') }} sat
INNER JOIN {{ ref('hub_<entity>') }} hub
    ON sat.hk_<entity> = hub.hk_<entity>
LEFT JOIN {{ ref('dim_<ref>') }} ref_dim
    ON ...  -- Snowflake join
WHERE sat.dss_is_current = 'Y'
```

#### Dimension Pflicht-Spalten (Confluence §13)

| Spalte | Typ | Beschreibung | Fallback |
|--------|-----|-------------|----------|
| `{dim}_key` | CHAR(64) | Hash Key (PK) | - |
| `{dim}_id` | NVARCHAR(255) | Technische/fachliche ID | - |
| `{dim}_code` | NVARCHAR(255) | Sprechender Schlüssel | = ID |
| `{dim}_name` | NVARCHAR(255) | Bezeichnung | = CODE oder 'UNKNOWN' |

#### Dimension Ghost Record

```sql
UNION ALL
SELECT
    '-1'       AS <entity>_key,
    '-1'       AS <entity>_id,
    'UNKNOWN'  AS <entity>_code,
    'UNKNOWN'  AS <entity>_name,
    ...
```

### 3. Create Faktentabelle

File: `models/mart/<concept>/fakt_<content>.sql`

```sql
{{ config(materialized='view') }}

SELECT
    -- Dimension Keys (FKs)
    ISNULL(hub1.hk_<hub1>, '-1') AS <hub1>_key,
    ISNULL(hub2.hk_<hub2>, '-1') AS <hub2>_key,
    
    -- Measures
    sat.measure_1,
    sat.measure_2,
    
    -- Degenerate Dimensions
    sat.order_number,
    
    -- Metadata
    sat.dss_load_date
FROM {{ ref('link_<hub1>_<hub2>') }} lnk
LEFT JOIN {{ ref('sat_link_<entity>__<system>_current_v') }} sat
    ON lnk.hk_link = sat.hk_link
    AND sat.dss_is_current = 'Y'
LEFT JOIN {{ ref('hub_<hub1>') }} hub1
    ON lnk.hk_<hub1> = hub1.hk_<hub1>
LEFT JOIN {{ ref('hub_<hub2>') }} hub2
    ON lnk.hk_<hub2> = hub2.hk_<hub2>
```

### 4. Snowflaking Rules (Confluence §13)

When referencing other dimensions from a dimension:
- Referenced dimension must NOT change the granularity of the main dimension
- Only 0:n, 1:n, 1:1 relationships allowed
- Always include 3 columns: `{dim}_key`, `{dim}_id`, `{dim}_code`
- Unresolvable reference: HK='-1', ID='-1', CODE='UNKNOWN'

### 5. Historisierung (Confluence §8)

| SCD Type | Implementation | When |
|----------|---------------|------|
| SCD1 | `WHERE dss_is_current = 'Y'` | Standard dimensions |
| SCD2 | Include dss_start/end_datetime | Historical tracking |
| Bitemporal | Fachliche + technische Zeit | Regulatory requirements |

### 6. Documentation

- Schema YAML: `models/mart/<concept>/_<concept>__models.yml`
- Tests: not_null on key columns, accepted_values for codes

## Validation Checklist

- [ ] Pflicht-Spalten vorhanden: `{dim}_key`, `{dim}_id`, `{dim}_code`, `{dim}_name`
- [ ] NULL CODE → 'UNKNOWN', NULL NAME → 'UNKNOWN'
- [ ] Ghost Record mit key='-1', code='UNKNOWN'
- [ ] Snowflaking: Granularität nicht verändert
- [ ] View (nicht materialisiert, Confluence: Virtualisierung bevorzugt)
- [ ] Schema YAML dokumentiert

## References

- Confluence ITDATAH §13 (DataHub/IMS – Dimensionale Modellierung)
- Confluence ITDATAH §2.5 (PIT), §2.6 (Bridge)
- `references/dim-rules.md` - Dimensions-Regeln
- `templates/dim.sql` - Dimension Template
- `templates/fakt.sql` - Faktentabelle Template

---
name: create-mart-object
description: 'Creates DataHub/IMS mart objects including dimensions, fact tables, PIT and Bridge tables for reporting. Use when building dimensional models from Data Vault. Keywords: dimension fact mart PIT bridge Kimball reporting SCD'
---
