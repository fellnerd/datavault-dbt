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

## Hash-Berechnung (T-SQL nativ)
Verwende **immer** native SQL Server HASHBYTES — **niemals** automate_dv Hash-Macros (inkompatibel mit SQL Server).

**Null-Handling:** `'-1'` als Null-Placeholder (konfiguriert als `null_placeholder_string` in dbt_project.yml).
**Trimming:** `LTRIM(RTRIM(...))` um alle Hash-Inputs.

```sql
-- Entity Hash Key (einzelner Business Key)
CONVERT(CHAR(64), HASHBYTES('SHA2_256',
    ISNULL(LTRIM(RTRIM(CAST(BUSINESS_KEY AS NVARCHAR(MAX)))), '-1')
), 2) AS hk_<entity>

-- Link Hash Key (zusammengesetzt mit Separator)
CONVERT(CHAR(64), HASHBYTES('SHA2_256',
    CONCAT(
        ISNULL(LTRIM(RTRIM(CAST(BK1 AS NVARCHAR(MAX)))), '-1'),
        '^^',
        ISNULL(LTRIM(RTRIM(CAST(BK2 AS NVARCHAR(MAX)))), '-1')
    )
), 2) AS hk_link_<e1>_<e2>

-- Hash Diff (mehrere Spalten)
CONVERT(CHAR(64), HASHBYTES('SHA2_256',
    CONCAT(
        ISNULL(LTRIM(RTRIM(CAST(col1 AS NVARCHAR(MAX)))), '-1'),
        ISNULL(LTRIM(RTRIM(CAST(col2 AS NVARCHAR(MAX)))), '-1')
    )
), 2) AS hd_<entity>
```

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
