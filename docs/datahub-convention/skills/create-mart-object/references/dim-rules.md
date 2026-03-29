# Dimension Rules Reference (Confluence ITDATAH §13)

## Pflicht-Spalten

Jede Dimension MUSS diese 4 Spalten haben:

| Spalte | Typ | Beschreibung | NULL-Handling |
|--------|-----|-------------|---------------|
| `{dim}_key` | CHAR(64) | Hash Key aus Hub (PK) | Nie NULL |
| `{dim}_id` | NVARCHAR(255) | Technische/fachliche ID aus Vorsystem | Nie NULL |
| `{dim}_code` | NVARCHAR(255) | Sprechender Business-Schlüssel | NULL → ID verwenden |
| `{dim}_name` | NVARCHAR(255) | Bekannte Bezeichnung | NULL → CODE, dann 'UNKNOWN' |

### Fallback-Kaskade

```sql
<entity>_code = ISNULL(<source_code>, CAST(<source_id> AS NVARCHAR(255)))
<entity>_name = ISNULL(<source_name>, ISNULL(<source_code>, 'UNKNOWN'))
```

## Ghost Record

**Jede Dimension hat genau 1 Ghost Record:**

```
{dim}_key            = '-1'
{dim}_id             = '-1'
{dim}_code           = 'UNKNOWN'
{dim}_name           = 'UNKNOWN'
[alle String-Spalten] = 'UNKNOWN'
[alle Date-Spalten]   = '1753-01-01'
[alle Integer-Spalten] = -1
dss_sec_value_key    = 'ghost_record'
```

**WICHTIG:** Ghost Records im DataHub werden **neu erzeugt**, NICHT aus dem Vault übernommen.

## Snowflaking (Dimension-Relationships)

### Erlaubt
- 0:n Beziehungen
- 1:n Beziehungen
- 1:1 Beziehungen

### VERBOTEN
- n:m Beziehungen (würde Granularität ändern)

### Pflicht-Spalten bei Snowflake-Referenz

3 Spalten der referenzierten Dimension müssen mitgeliefert werden:
1. `{ref_dim}_key` = BK/HK der referenzierten Dimension
2. `{ref_dim}_id` = Technische ID
3. `{ref_dim}_code` = Sprechender Schlüssel

### Nicht auflösbare Referenz

```sql
ISNULL(ref.hk_<entity>, '-1')         AS <entity>_key
ISNULL(ref.<entity>_id, '-1')         AS <entity>_id
ISNULL(ref.<entity>_code, 'UNKNOWN')  AS <entity>_code
```

## Historisierung (SCD)

| Typ | Beschreibung | Verwendung | Implementation |
|-----|-------------|-----------|----------------|
| SCD1 | Überschreiben | Standard | `WHERE dss_is_current = 'Y'` |
| SCD2 | Vollständige Historie | Historische Dimensionen | Start/End DateTime mitliefern |
| Bitemporal | Fachlich + technisch | Regulatorisch | 2 Zeitachsen |

### SCD2 Implementierung
```sql
SELECT
    ...,
    dss_start_datetime,
    dss_end_datetime,
    dss_is_current
FROM {{ ref('sat_<entity>__<system>_current_v') }}
-- Kein WHERE dss_is_current Filter!
```

## Faktentabelle-Regeln

| Aspekt | Regel |
|--------|-------|
| FK zu Dimension | Immer ISNULL(hk, '-1') |
| NULL Measures | Je nach Fachlichkeit: 0 oder NULL |
| Aggregation | Immer in View, nicht in Bridge |
| Granularität | Muss dokumentiert sein |

## PIT Table (Point in Time)

- Performance-optimierter Snapshot
- 1 Row pro Hub-Key pro Zeitpunkt
- Enthält: Hub HK + Sat dss_load_date für jeden Satelliten
- Naming: `pit_{hub}`

```sql
-- Struktur:
hk_<entity>           CHAR(64)
snapshotdate          DATETIME2(7)
sat1_dss_load_date    DATETIME2(7)
sat2_dss_load_date    DATETIME2(7)
...
```

## Bridge Table

- Löst multi-hop Beziehungen auf (über mehrere Links)
- Snapshot analog zu PIT
- Naming: `bridge_{content}`
- Enthält: Alle Hub HKs + Link HKs der Kette
