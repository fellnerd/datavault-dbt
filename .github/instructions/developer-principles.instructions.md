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

Performance-Problem bei Zeitabfragen?
└─ JA → PIT TABLE (nur bei Bedarf)
```

## Pflicht-Felder pro Objekttyp

### Hub
```
hk_<entity>           -- Hash Key (PK), SHA2_256, CHAR(64)
<business_key>        -- Business Key (original)
dss_load_date         -- Ladezeitpunkt, DATETIME2
dss_record_source     -- Quelle, VARCHAR(100)
```

### Satellite
```
hk_<entity>           -- Hash Key (FK zum Hub), PK Teil 1
dss_load_date         -- Ladezeitpunkt, PK Teil 2
hd_<entity>           -- Hash Diff (Änderungserkennung)
<attribute_1..n>      -- Fachliche Attribute
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
```
hk_<entity>           -- FK zum Hub (PK Teil 1)
dss_load_date         -- PK Teil 2
<cdk_columns>          -- Child Dependent Keys (unterscheidet Records)
hd_<entity>_ma        -- Hash Diff
<attributes>           -- Attribute
```

## Satellite-Schnitt Regeln
- **1 Thema = 1 Satellite** — Gruppiere nach fachlicher Zusammengehörigkeit
- **Nach Änderungsfrequenz schneiden** — Häufig vs. selten ändernde Attribute trennen
- **Stammdaten** → eigener Satellite (z.B. `sat_kunde`)
- **Transaktionsdaten** → eigener Satellite (z.B. `sat_buchung`)
- **System-Metadaten** (CREUSER, MUTUSER, etc.) → ggf. eigener Satellite oder im Haupt-Satellite

## Hash-Berechnung im Staging
- **Alle** Hash Keys und Hash Diffs werden **im Staging** berechnet (automate_dv Best Practice)
- Hub Hash Key = `SHA2_256(Business Key)`
- Link Hash Key = `SHA2_256(FK1 ^^ FK2)` mit `^^` als Separator
- DC Link Hash Key = `SHA2_256(Parent_FK ^^ DCK1 ^^ DCK2)`
- Hash Diff = `SHA2_256(CONCAT(alle_payload_spalten))` — **keine Separatoren** im Hash Diff

## automate_dv Macros (Vault-Schicht)
- Hub: `automate_dv.hub(src_pk, src_nk, src_ldts, src_source, source_model)`
- Satellite: `automate_dv.sat(src_pk, src_hashdiff, src_payload, src_eff, src_ldts, src_source, source_model)`
- Link: `automate_dv.link(src_pk, src_fk, src_ldts, src_source, source_model)`
- MA Satellite: `automate_dv.ma_sat(src_pk, src_cdk, src_hashdiff, src_payload, src_eff, src_ldts, src_source, source_model)`

### Hashdiff-Alias Konvention
```yaml
src_hashdiff:
  source_column: "hd_<entity>"   # Name im Staging
  alias: "hashdiff"              # IMMER "hashdiff" als Alias
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
```sql
{%- set yaml_metadata -%}
source_model: "<staging_model>"
src_pk: "hk_<entity>"
src_nk: "<business_key>"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}
{{ automate_dv.hub(...metadata_dict...) }}
```
