---
applyTo: 'models/mart/**'
---
# Mart / DataHub (IMS) – dbt Data Vault (Confluence ITDATAH §13)

> Diese Regeln gelten automatisch für alle Dateien unter `models/mart/`.

## Zweck
Der DataHub/IMS Layer implementiert **dimensionale Modellierung** (Kimball) für Reporting. PIT-Tabellen → Dimensionen, Bridge-Tabellen → Faktentabellen.

## Grundsätze (Confluence §13)

1. **Dimensionale Modellierung** (Kimball) bevorzugt
2. **Virtualisierung** (Views) vor Persistierung
3. PIT-Tabellen als Basis für **Dimensionen**
4. Bridge-Tabellen als Basis für **Faktentabellen**
5. Ghost Records werden im DataHub **neu erzeugt** (nicht aus Vault übernommen)

## Dimensionen

### Pflicht-Spalten

| Spalte | Typ | Beschreibung | Fallback |
|--------|-----|-------------|----------|
| `{dim}_key` | CHAR(64) | Hash Key (PK) | - |
| `{dim}_id` | NVARCHAR(255) | Technische/fachliche ID aus Vorsystem | - |
| `{dim}_code` | NVARCHAR(255) | Sprechender Business-Schlüssel | = ID |
| `{dim}_name` | NVARCHAR(255) | Bekannte Bezeichnung | = CODE |

### NULL-Behandlung in Dimensionen
- CODE = NULL → `'UNKNOWN'`
- NAME = NULL → `'UNKNOWN'`

### Dimension Template

```sql
-- models/mart/<concept>/dim_<entity>.sql
{{ config(
    materialized='view',
    schema='mart_<concept>'
) }}

SELECT
    hk_<entity>                 AS <entity>_key,
    <source_id>                 AS <entity>_id,
    ISNULL(<source_code>, <source_id>) AS <entity>_code,
    ISNULL(<source_name>, ISNULL(<source_code>, 'UNKNOWN')) AS <entity>_name,
    -- weitere Attribute
    dss_load_date,
    dss_record_source
FROM {{ ref('sat_<entity>__<system>_current_v') }}
WHERE dss_is_current = 'Y'
```

### Dimension Ghost Record (Confluence §13)

```
{dim}_key            = '-1'
{dim}_id             = '-1'
{dim}_code           = 'UNKNOWN'
{dim}_name           = 'UNKNOWN'
dss_sec_value_key    = 'ghost_record'
```

## Faktentabellen

```sql
-- models/mart/<concept>/fakt_<entity>.sql
{{ config(
    materialized='view',
    schema='mart_<concept>'
) }}

SELECT
    -- Dimensionen-Keys (FKs)
    ISNULL(hub1.hk_<hub1>, '-1') AS <hub1>_key,
    ISNULL(hub2.hk_<hub2>, '-1') AS <hub2>_key,
    -- Measures
    sat.measure_1,
    sat.measure_2,
    -- Metadata
    sat.dss_load_date
FROM {{ ref('link_<hub1>_<hub2>') }} lnk
LEFT JOIN {{ ref('sat_link_<entity>__<system>_current_v') }} sat
    ON lnk.hk_link_<hub1>_<hub2> = sat.hk_link_<hub1>_<hub2>
    AND sat.dss_is_current = 'Y'
LEFT JOIN {{ ref('hub_<hub1>') }} hub1
    ON lnk.hk_<hub1> = hub1.hk_<hub1>
LEFT JOIN {{ ref('hub_<hub2>') }} hub2
    ON lnk.hk_<hub2> = hub2.hk_<hub2>
```

## Snowflaking (Confluence §13)

Referenzierte Dimension darf **NICHT die Granularität** der Hauptdimension ändern:
- Nur 0:n, 1:n, 1:1 Beziehungen erlaubt
- **3 Pflicht-Spalten**: BK (HK), `{dim}_id`, `{dim}_code` der referenzierten Dimension
- Nicht auflösbare Beziehung: HK=`'-1'`, ID=`'-1'`, CODE=`'UNKNOWN'`

## Historisierung im DataHub (Confluence §8)

| Typ | Beschreibung | Verwendung |
|-----|-------------|-----------|
| SCD1 | Überschreiben bei Änderungen | Standard-Dimensionen |
| SCD2 | Vollständige Historie (Start/End) | Historische Dimensionen |
| Bitemporal | Fachliche + technische Historie | Spezialfälle |

## Naming (Confluence §5)

| Objekt | Pattern | Beispiel |
|--------|---------|---------|
| Dimension (Common) | `dim_{entity}` | `mart.dim_date` |
| Dimension (Domain) | `dim_{entity}` | `mart_hcm.dim_mitarbeiter` |
| Faktentabelle | `fakt_{content}` | `mart_coar.fakt_auftragsabrechnung` |
| Flat Table | `{content}` | `mart_hcm.mitarbeiter_export` |

## Schema

| Ordner | Schema |
|--------|--------|
| `mart/_common/` | `mart` |
| `mart/<concept>/` | `mart_<concept>` |

## PIT + Bridge (Confluence §2.5, §2.6)

### PIT (Point in Time)
- Performance-optimierte Snapshots zu bestimmten Zeitpunkten
- Liest Historie der Satelliten für einen Zeitpunkt
- Naming: `pit_{hub/link}`
- Basis für Dimensionen

### Bridge
- Löst Beziehungen über mehrere Links hinweg auf
- Snapshots analog zu PIT
- Naming: `bridge_{content}`
- Basis für Faktentabellen
