---
applyTo: 'models/business_vault/**'
---
# Business Vault – dbt Data Vault (Confluence ITDATAH §10, §2.3, §2.5, §2.6)

> Diese Regeln gelten automatisch für alle Dateien unter `models/business_vault/`.

## Zweck
Der Business Vault enthält **Soft Rules** – Daten werden interpretiert, berechnet oder konsolidiert. Er erweitert den Raw Vault, ohne diesen zu verändern.

## Schicht

| Layer | Schema | Persistenz | Beschreibung |
|-------|--------|-----------|--------------|
| Business Vault | `vault` | Persistent + Virtuell | Soft Rules, Business Logik, PITs, Bridges |

## Soft Rules (Confluence §10)

Soft Rules **verändern oder interpretieren** Daten. Sie dürfen NUR im Business Vault angewendet werden, NICHT im Raw Vault oder Staging.

### Erlaubte Soft Rules

| Soft Rule | Beschreibung | Beispiel |
|-----------|-------------|---------|
| **Berechnungen** | Abgeleitete Werte | Brutto = Netto * (1 + MwSt) |
| **Aggregationen** | Zusammenfassungen | SUM, AVG, COUNT über Perioden |
| **Adress-Standardisierung** | Normalisierung | PLZ-Format, Straßenabkürzungen |
| **Werte ersetzen/zusammenführen** | Mapping | Ländercodes ISO ↔ FIPS |
| **Fachliche Gültigkeiten auflösen** | Zeiträume | Überlappende Gültigkeiten bereinigen |
| **Konsolidierung** | Zusammenführung | Same-as Resolution, Master Data |

### NICHT erlaubt im Business Vault

- Keine Änderung von Business Keys
- Keine Löschung von Raw Vault Records
- Raw Vault bleibt unberührt (Insert-Only)

## Business Satellite

Ein Business Satellite erweitert einen Raw Satellite mit Soft Rules:

```sql
-- models/business_vault/sat_<entity>__business.sql
{{ config(materialized='view') }}

SELECT
    raw_sat.hk_<entity>,
    raw_sat.HASHDIFF,
    -- Soft Rule: Berechnung
    raw_sat.netto_betrag * (1 + ref_mwst.mwst_satz) AS brutto_betrag,
    -- Soft Rule: Standardisierung
    UPPER(TRIM(raw_sat.plz)) AS plz_standardisiert,
    -- Original-Attribute
    raw_sat.netto_betrag,
    raw_sat.dss_load_date,
    raw_sat.dss_record_source
FROM {{ ref('sat_<entity>__<system>') }} raw_sat
LEFT JOIN {{ ref('hub_ref_mwst') }} ref_mwst
    ON ...
```

**Naming:** `sat_{entity}__business` oder `sat_{entity}__<specific_rule>`

## Hard Rules vs. Soft Rules (Confluence §10)

| Kriterium | Hard Rules (Raw Vault/Staging) | Soft Rules (Business Vault) |
|-----------|-------------------------------|----------------------------|
| Datenveränderung | **NEIN** – Inhalt bleibt gleich | **JA** – Inhalt wird interpretiert |
| Leer-Strings → NULL | ✓ | |
| Datentyp-Vereinheitlichung | ✓ | |
| Datumsformat-Standard | ✓ | |
| Zeitzonen-Vereinheitlichung | ✓ | |
| LTRIM/RTRIM | ✓ | |
| Berechnungen | | ✓ |
| Aggregationen | | ✓ |
| Adress-Standardisierung | | ✓ |
| Werte ersetzen | | ✓ |
| Fachliche Gültigkeiten | | ✓ |
| Konsolidierung | | ✓ |

## PIT Table (Point in Time) – Confluence §2.5

Performance-optimierter Snapshot zu bestimmten Zeitpunkten. Basis für **Dimensionen** im Mart.

```sql
-- models/business_vault/pit_<entity>.sql
{{ config(materialized='incremental', incremental_strategy='append') }}

{{ automate_dv.pit(
    src_pk='hk_<entity>',
    as_of_dates_table='as_of_dates',
    satellites={
        'sat_<entity>__<system>': {
            'pk': {'PK': 'HASHDIFF'},
            'ldts': {'LDTS': 'dss_load_date'}
        }
    },
    stage_tables_ldts='dss_load_date',
    src_ldts='dss_load_date'
) }}
```

**Aufbau:**
```
hk_{entity}              CHAR(64)       - Hub Hash Key
snapshotdate             DATETIME2(7)   - Zeitpunkt des Snapshots
sat1_dss_load_date       DATETIME2(7)   - Gültiger Sat-Record zum Zeitpunkt
sat2_dss_load_date       DATETIME2(7)   - Gültiger Sat-Record zum Zeitpunkt
```

**Naming:** `pit_{hub/link}` (z.B. `pit_mitarbeiter`)

## Bridge Table – Confluence §2.6

Löst Beziehungen über **mehrere Links** hinweg auf. Basis für **Faktentabellen** im Mart.

```sql
-- models/business_vault/bridge_<content>.sql
{{ config(materialized='incremental', incremental_strategy='append') }}

{{ automate_dv.bridge(
    src_pk='hk_<entity>',
    as_of_dates_table='as_of_dates',
    bridge_walk={
        'hub_<entity>': {
            'pk': 'hk_<entity>',
            'link': 'link_<entity>_<entity2>',
            'link_pk': 'hk_link_<entity>_<entity2>',
            ...
        }
    },
    stage_tables_ldts='dss_load_date',
    src_ldts='dss_load_date'
) }}
```

**Aufbau:**
```
snapshotdate             DATETIME2(7)   - Zeitpunkt des Snapshots
hk_{hub1}                CHAR(64)       - Hub 1 Hash Key
hk_link_{hub1}_{hub2}    CHAR(64)       - Link Hash Key
hk_{hub2}                CHAR(64)       - Hub 2 Hash Key
```

**Naming:** `bridge_{content}` (z.B. `bridge_mitarbeiter`)

## Materialisierung

- **Business Satellites:** Bevorzugt als **View** (Virtualisierung, Confluence §13)
- **PIT/Bridge:** Als **Incremental Table** (Performance-Gründe)

```yaml
# dbt_project.yml
business_vault:
  +schema: vault
  +materialized: view    # Default: View für Business Sats
```

## Beziehung zu anderen Schichten

```
Raw Vault (vault.raw)
    ↓ (Soft Rules)
Business Vault (vault.business)
    ↓ (PIT → Dimensionen, Bridge → Fakten)
Mart / DataHub (mart_<concept>)
```
