---
applyTo: '**/*.sql'
---
# SQL Server — Azure SQL Besonderheiten

## Reserved Keywords Escaping
SQL Server Reserved Keywords **müssen** in eckige Klammern escaped werden, wenn sie als Spaltenname verwendet werden:

```sql
-- ❌ FALSCH — SQL-Fehler
SELECT PLAN, LEVEL, KEY, STATUS FROM table

-- ✅ KORREKT
SELECT [PLAN], [LEVEL], [KEY], [STATUS] FROM table
```

Häufige Reserved Keywords in Abacus-Daten:
`PLAN`, `LEVEL`, `KEY`, `STATUS`, `TYPE`, `ORDER`, `GROUP`, `INDEX`, `BEFORE`, `AFTER`, `FUNCTION`, `VALUE`, `TABLE`, `VIEW`, `USER`, `ROLE`, `CHECK`, `DEFAULT`, `PRIMARY`, `FOREIGN`, `REFERENCES`, `RETURN`

## DROP EXTERNAL TABLE Pattern
Azure SQL unterstützt **kein** `DROP EXTERNAL TABLE IF EXISTS`. Verwende stattdessen:

```sql
-- ❌ FEHLER
DROP EXTERNAL TABLE IF EXISTS [stg].[ext_table_name]

-- ✅ KORREKT
IF OBJECT_ID('[stg].[ext_table_name]', 'U') IS NOT NULL
    DROP EXTERNAL TABLE [stg].[ext_table_name]
```

## Hash-Berechnung (automate_dv.stage() mit Custom Overrides)

Staging-Modelle verwenden das **automate_dv.stage()** Macro. Hash-Berechnung wird von automate_dv übernommen, mit zwei Custom Overrides in `macros/hash_override.sql`:

### Override 1: `sqlserver__cast_binary`
automate_dv Default: `CONVERT(BINARY(32), HASHBYTES(...), 2)` → **Unser Override:** `CONVERT(CHAR(64), HASHBYTES(...), 2)` — hex-encoded, lesbar, kompatibel mit bestehenden Vault-Tabellen.

### Override 2: `sqlserver__type_string`
automate_dv Default: `VARCHAR` → **Unser Override:** `NVARCHAR` — Unicode-safe für CH-Daten mit Umlauten. Wichtig: `HASHBYTES('SHA2_256', NVARCHAR)` ≠ `HASHBYTES('SHA2_256', VARCHAR)`.

### dbt_project.yml Konfiguration
```yaml
dispatch:
  - macro_namespace: automate_dv
    search_order: ['datavault', 'automate_dv']

vars:
  hash: 'SHA'
  null_placeholder_string: '-1'
  concat_string: '||'
  hash_content_casing: 'DISABLED'
  escape_char_left: '['
  escape_char_right: ']'
```

### Escaping von Reserved Keywords (in Staging)
Verwende `_escape` als derived column im YAML-Metadata Block:
```yaml
derived_columns:
  _escape:
    source_column:
      - "PLAN"
      - "LEVEL"
      - "timestamp_landing-zone"
    escape: true
```
Dies fügt Spalten zu automate_dv's `columns_to_escape` hinzu, ohne problematische Aliase zu erzeugen.

## Azure SQL Serverless Limitationen
- **Columnstore Indexes:** Nicht verfügbar im Basic/Serverless Tier
  → Immer `as_columnstore: false` in dbt-Modellen setzen
- **Auto-Pause:** Datenbank pausiert nach 60 Min Inaktivität, erste Abfrage nach Pause dauert ~30s
- **OPENROWSET:** Via External Tables (PolyBase), nicht direkt

## Typ-Konvertierung
Bevorzuge `TRY_CAST` über `CAST` für fehlertolerante Konvertierung:

```sql
-- ✅ TRY_CAST gibt NULL zurück bei Fehler
COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date

-- ❌ CAST wirft Fehler bei ungültigen Werten
CAST(dss_load_date AS DATETIME2) AS dss_load_date
```

## Post-Hooks für Vault-Modelle
Alle Raw Vault Modelle **müssen** Post-Hooks für Performance-Indexe haben:

```sql
-- Hub
post_hook=["{{ create_hash_index('hk_<entity>') }}"]

-- Satellite (zusätzlich current flag)
post_hook=[
    "{{ create_hash_index('hk_<entity>') }}",
    "{{ update_satellite_current_flag(this, 'hk_<entity>') }}"
]
```
