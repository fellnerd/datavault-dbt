---
name: datavault-patterns
description: "DV2.1 Pattern-Bibliothek mit Templates für Hub, Satellite, Link, DC Satellite, MA Satellite und Reference Table. Basiert auf automate_dv Macros und dem Adworks-Referenz-Pattern."
---

# Data Vault 2.1 Pattern-Bibliothek

## Wann verwenden?
Trigger-Phrasen:
- "Hub erstellen", "Create hub"
- "Satellite erstellen", "Add satellite"
- "Link erstellen", "Create link"
- "Transaction Link", "Non-Historized Link", "TL"
- "DC Pattern", "Dependent Child"
- "MA Sat", "Multi-Active"
- "Reference Table"

## Adworks-Referenzen
- Hub: `models/raw_vault/adworks/hubs/hub_kunde.sql`
- Satellite: `models/raw_vault/adworks/satellites/sat_kunde.sql`
- Link: `models/raw_vault/adworks/links/link_verkauf_kunde.sql`
- Schema-YAML: `models/raw_vault/adworks/_adworks__models.yml`

## Entscheidungslogik (aus DEVELOPER.md)
```
Stabiler Business Key?           → HUB
Beschreibende Attribute?         → SATELLITE (am Hub)
Beziehung zwischen 2+ Entities?  → LINK
Entity ohne eigenen BK?          → DC SATELLITE (am Link)
Mehrere gleichzeitige Werte?     → MA SATELLITE (src_cdk)
Stabile Lookup-Werte?            → REFERENCE TABLE
Unveränderliche Ereignis-Daten?  → TRANSACTION LINK (_tl Suffix)
Zeitraum einer Beziehung?        → EFFECTIVITY SATELLITE (am Link)
Punktuelle Abfrage Optimierung?  → PIT TABLE
```

## Hub Template
```sql
{#
    Hub: hub_<entity>
    Source: ewb_<staging_model>
    Business Keys: <business_key>

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   <YYYY-MM-DD> V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_<entity>') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_<staging_model>"
src_pk: "hk_<entity>"
src_nk: "<business_key>"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.hub(src_pk=metadata_dict["src_pk"],
                   src_nk=metadata_dict["src_nk"],
                   src_ldts=metadata_dict["src_ldts"],
                   src_source=metadata_dict["src_source"],
                   source_model=metadata_dict["source_model"]) }}
```

**Pflichtfelder Hub:**
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| hk_<entity> | CHAR(64) | SHA-256 Hash des Business Key |
| <business_key> | varies | Natürlicher Schlüssel |
| dss_load_date | DATETIME2(6) | Erst-Ladezeitpunkt |
| dss_record_source | VARCHAR(50) | Quellsystem-Kennung |

## Satellite Template
```sql
{#
    Satellite: sat_<entity>
    Parent Hub: hub_<entity>
    Source: ewb_<staging_model>
    Payload: <payload_columns>

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   <YYYY-MM-DD> V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_<entity>') }}",
        "{{ update_satellite_current_flag('hk_<entity>', 'dss_load_date') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_<staging_model>"
src_pk: "hk_<entity>"
src_hashdiff:
  source_column: "hd_<entity>"
  alias: "hashdiff"
src_payload:
  - SPALTE_1
  - SPALTE_2
  - SPALTE_N
src_eff: "dss_start_date"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(src_pk=metadata_dict["src_pk"],
                   src_hashdiff=metadata_dict["src_hashdiff"],
                   src_payload=metadata_dict["src_payload"],
                   src_eff=metadata_dict["src_eff"],
                   src_ldts=metadata_dict["src_ldts"],
                   src_source=metadata_dict["src_source"],
                   source_model=metadata_dict["source_model"]) }}
```

**Pflichtfelder Satellite:**
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| hk_<entity> | CHAR(64) | FK zum Hub |
| hashdiff | CHAR(64) | SHA-256 Hash der Payload (alias!) |
| dss_load_date | DATETIME2(6) | Ladezeitpunkt |
| dss_start_date | DATETIME2(6) | Gültigkeitsbeginn |
| dss_end_date | DATETIME2(6) | Gültigkeitsende (NULL = aktuell) |
| dss_is_current | CHAR(1) | 'Y' / 'N' |
| dss_record_source | VARCHAR(50) | Quellsystem |
| payload... | varies | Attribut-Spalten |

**Wichtig:** `src_hashdiff` muss `alias: "hashdiff"` haben (nicht den Spaltennamen!).

## Link Template
```sql
{#
    Link: link_<e1>_<e2>
    Source: ewb_<staging_model>
    Foreign Keys: hk_<entity_1>, hk_<entity_2>

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   <YYYY-MM-DD> V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_<e1>_<e2>') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_<staging_model>"
src_pk: "hk_link_<e1>_<e2>"
src_fk:
  - "hk_<entity_1>"
  - "hk_<entity_2>"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.link(src_pk=metadata_dict["src_pk"],
                    src_fk=metadata_dict["src_fk"],
                    src_ldts=metadata_dict["src_ldts"],
                    src_source=metadata_dict["src_source"],
                    source_model=metadata_dict["source_model"]) }}
```

**Link Hash Key Berechnung (im Staging):**
```sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256',
    ISNULL(CAST(FK_1 AS NVARCHAR(MAX)), '') + '^^' +
    ISNULL(CAST(FK_2 AS NVARCHAR(MAX)), '')
), 2) AS hk_link_<e1>_<e2>
```

## DC Satellite (Dependent Child)
- Kein eigener Hub → Satellite am Link
- Link hat nur 1 FK (der Parent-Hub)
- Hash Key = `HASH(FK ^^ DCK1 ^^ DCK2)`

## MA Satellite (Multi-Active)
- Naming: `sat_<entity>_ma__<source>` — `_ma` Suffix vor `__<source>`
- Hash Diff: `hd_<entity>_ma`
- Zusätzliches `src_cdk` (Child-Dependent-Key) in der automate_dv config
- Erlaubt mehrere gleichzeitig gültige Werte pro Hash Key
- Beispiel: `sat_vertrag_optionen_ma__compax` (CDK: `abo_option_name`)

## Transaction Link (TL) — Non-Historized

Transaction Links speichern unveränderliche Ereignisse (z.B. CDR-Events, Buchungen).

**Naming:** `link_<entity>_tl` — `_tl` Suffix, **KEIN** `__source` Suffix

**Unterschied zu regulärem Link:**
| Merkmal | Regulärer Link | Transaction Link (TL) |
|---------|---------------|----------------------|
| Naming | `link_<e1>_<e2>` | `link_<entity>_tl` |
| Hash Diff | keiner | keiner |
| Historisierung | keine | keine |
| Event-ID im PK | nein | ja |
| Satellite | Effectivity Sat / DC Sat | Transaction Sat (Non-Hist.) |

**Template:**
```sql
{{ config(
    materialized='incremental',
    as_columnstore=false,
    incremental_strategy='append',
    post_hook=["{{ create_hash_index('hk_link_<entity>_tl') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "<staging_model>"
src_pk: "hk_link_<entity>_tl"
src_fk:
  - "hk_<entity_1>"
  - "hk_<entity_2>"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.link(src_pk=metadata_dict["src_pk"],
                    src_fk=metadata_dict["src_fk"],
                    src_ldts=metadata_dict["src_ldts"],
                    src_source=metadata_dict["src_source"],
                    source_model=metadata_dict["source_model"]) }}
```

**Hash Key** enthält Event-ID + alle FKs: `Hash(event_id, fk_1, fk_2)`
**Zugehöriger Transaction Satellite:** `sat_<entity>__<source>` — KEIN Hash Diff, KEIN post_hook für current_flag

## `__source` Suffix Regel
> Der `__source` Suffix gilt **NUR für Satellites** (einfach und MA), **NICHT** für Hubs oder Links.

| Objekt | `__source` Suffix | Beispiel |
|--------|:-----------------:|---------|
| Hub | ❌ | `hub_vertrag` |
| Satellite | ✅ | `sat_vertrag__compax` |
| MA Satellite | ✅ | `sat_vertrag_optionen_ma__compax` |
| Link | ❌ | `link_vertrag_position` |
| Transaction Link | ❌ | `link_cdr_event_tl` |

## dbt_project.yml Konfiguration
EWB-Modelle werden im `_common` Ordner abgelegt und nutzen Schema `vault` (bereits in `dbt_project.yml` unter `_common:` konfiguriert).

## Schema-YAML Template (`_ewb__models.yml`)
```yaml
version: 2

models:
  - name: hub_<entity>
    description: "Hub for <entity>"
    columns:
      - name: hk_<entity>
        data_type: "CHAR(64)"
        description: "Hash Key"
        tests: [not_null, unique]
      - name: <business_key>
        data_type: "..."
        description: "Business Key"
        tests: [not_null]
      - name: dss_load_date
        data_type: "DATETIME2(6)"
      - name: dss_record_source
        data_type: "VARCHAR(50)"
```
