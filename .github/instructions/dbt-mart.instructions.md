---
applyTo: 'models/mart/**'
---
# Mart Layer — Dimensionale Modellierung (Star Schema)

## Zweck
Der Mart Layer implementiert **dimensionale Modellierung** (Kimball) als Views auf den Raw Vault.
Virtualisierung (Views) vor Persistierung.

## Surrogate Key Pattern

Alle Dimension Keys verwenden das `surrogate_key()` Macro (`macros/surrogate_key.sql`):
```sql
{{ surrogate_key('business_key_column') }} AS {dim}_key
```

Generiert deterministisches BIGINT:
```sql
ABS(CONVERT(BIGINT, HASHBYTES('MD5', CAST(column AS NVARCHAR(MAX)))))
```

**Wichtig:** Fakt-FKs verwenden denselben `surrogate_key()` Aufruf für Join-Kompatibilität.

## Dimension Pflicht-Spalten

| Spalte | Typ | Beschreibung | Fallback |
|--------|-----|-------------|----------|
| `{dim}_key` | BIGINT | Surrogate Key via `surrogate_key()` | — |
| `{dim}_id` | NVARCHAR(255) | Technische ID | — |
| `{dim}_code` | NVARCHAR(255) | Sprechender Schluessel | = ID |
| `{dim}_name` | NVARCHAR(255) | Bekannte Bezeichnung | = CODE oder 'UNKNOWN' |
| `dss_load_date` | DATETIME2 | Ladezeitpunkt aus Vault | — |
| `dss_record_source` | NVARCHAR(255) | Quellenidentifikation | — |

## NULL-Behandlung
```sql
ISNULL(code_col, CAST(id_col AS NVARCHAR(255)))              AS {dim}_code
ISNULL(name_col, ISNULL(code_col, 'UNKNOWN'))                AS {dim}_name
```

## Dimension Template
```sql
{{ config(materialized='view', tags=['dimension']) }}

SELECT
    {{ surrogate_key('hub.bk') }}                        AS <entity>_key,
    CAST(hub.bk AS NVARCHAR(255))                        AS <entity>_id,
    ISNULL(sat.code, CAST(hub.bk AS NVARCHAR(255)))      AS <entity>_code,
    ISNULL(sat.name, ISNULL(sat.code, 'UNKNOWN'))         AS <entity>_name,
    sat.dss_load_date,
    sat.dss_record_source
FROM {{ ref('hub_<entity>') }} hub
INNER JOIN {{ ref('sat_<entity>') }} sat
    ON hub.hk_<entity> = sat.hk_<entity>
    AND sat.dss_is_current = 'Y'
```

## Faktentabelle Template
```sql
{{ config(materialized='view', tags=['fact']) }}

SELECT
    {{ surrogate_key('hub_dim.bk') }}    AS <dim>_key,
    sat.measure_column                    AS betrag,
    sat.dss_load_date,
    sat.dss_record_source
FROM {{ ref('hub_<entity>') }} h
INNER JOIN {{ ref('sat_<entity>') }} sat
    ON h.hk_<entity> = sat.hk_<entity> AND sat.dss_is_current = 'Y'
INNER JOIN {{ ref('link_<e1>_<e2>') }} lnk
    ON h.hk_<entity> = lnk.hk_<entity>
INNER JOIN {{ ref('hub_<dim>') }} hub_dim
    ON lnk.hk_<dim> = hub_dim.hk_<dim>
```

## Naming

| Objekt | Pattern | Beispiel |
|--------|---------|---------|
| Dimension | `dim_{entity}_v` | `dim_person_v`, `dim_projekt_v` |
| Faktentabelle | `fakt_{content}_v` | `fakt_stunden_v` |
| Reference View | `ref_{name}_v` | `ref_konto_v`, `ref_abteilung_v` |
| Schema (common) | `mart` | `mart._common` |
| Schema (domain) | `mart_{concept}` | `mart_project` |

> **`_v` Suffix:** Kennzeichnet publizierte Output-Views für BI-Tools und nachgelagerte Modelle.
> Staging-Views (`stg.*`) sind interne Pipeline-Objekte und erhalten **kein** `_v`.

## Schema-YAML Pflicht-Tests

```yaml
columns:
  - name: {dim}_key
    tests: [not_null, unique]
  - name: {dim}_code
    tests: [not_null]
  - name: {dim}_name
    tests: [not_null]
```

## Materialisierung

- **Standard:** `materialized='view'` — Alle Mart-Objekte sind Views (Virtualisierung bevorzugt)
- **Ausnahme:** `materialized='table'` — Nur bei Performance-Problemen (komplexe Joins, grosse Datenmengen)

### Pflicht-Regel: Table → immer zusätzliche 1:1 View

Wenn ein Mart-Objekt als `table` materialisiert wird, **muss** eine 1:1 Wrapper-View erstellt werden, damit alle veröffentlichten Mart-Objekte eine einheitliche View-Schnittstelle haben. BI-Tools und Konsumenten referenzieren immer die View, nie die Table direkt.

**Pattern `__base` + View:**
```
dim_<entity>__base.sql    →  materialized='table'   (Performance-Cache, intern)
dim_<entity>_v.sql        →  materialized='view'    (öffentliche Schnittstelle)
```

**Implementierung `dim_<entity>_v.sql` bei table-Backing:**
```sql
{{ config(materialized='view', tags=['dimension']) }}

SELECT * FROM {{ ref('dim_<entity>__base') }}
```

**Konsequenz:** Im Schema sind IMMER nur Views sichtbar (`dim_*_v`, `fakt_*_v`). Die `__base`-Tables sind interne Artefakte.

> ❌ FALSCH: `dim_projekt` = TABLE, `dim_person` = VIEW → Mischung im Schema
> ✅ KORREKT: `dim_projekt__base` = TABLE, `dim_projekt_v` = VIEW über `__base`

## ER-Diagramm
Jede Mart-Domain hat ein eigenes ER-Diagramm: `design/mart/er-mart-<concept>.mmd`
