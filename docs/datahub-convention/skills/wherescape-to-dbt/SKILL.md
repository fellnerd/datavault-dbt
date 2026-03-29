# Skill: Wherescape → dbt Migration

> Migriert ein bestehendes Wherescape-Objekt (Hub, Satellite, Link, Dimension, Fakt) in ein dbt Model.

## Wann verwenden

Dieses Skill wird verwendet wenn:
- Ein bestehendes Wherescape-Objekt nach dbt migriert werden soll
- Custom Functions aus RED in dbt Models übersetzt werden müssen
- Ein ganzer Information Mart von WS nach dbt portiert wird

## Voraussetzungen

- Zugang zum Produktions-Datahub (`sqlbi01`) via `mssql_connect`
- Kenntnis des WS-Objektnamens oder Schemas
- Optional: Custom Function Code aus RED

## Referenzen

Lies diese Dateien vor der Migration:
- `.github/instructions/wherescape-migration.instructions.md` — WS→dbt Mapping
- `.github/instructions/datahub-confluence.instructions.md` — DV 2.0 Regeln
- `.github/instructions/datavault-dbt.instructions.md` — Projekt-Architektur
- `.github/copilot/skills/wherescape-to-dbt/references/migration-checklist.md` — Checkliste

## Workflow

### Schritt 1: Objekt identifizieren

Verbinde dich zum Produktions-Datahub und identifiziere das Objekt:

```sql
-- Auf sqlbi01: Objekt suchen
SELECT s.name AS schema_name, t.name AS table_name, t.type_desc,
       t.create_date, t.modify_date
FROM sys.tables t JOIN sys.schemas s ON t.schema_id = s.schema_id
WHERE t.name LIKE '%<objekt_name>%'
ORDER BY s.name, t.name;
```

Bestimme:
- **Typ**: Hub, Satellite, Link, Dimension, Fakt, View, Business Vault
- **Schema**: raw, business, <concept>
- **Quellsystem(e)**: SAP, Jira, etc.
- **Beladungstyp**: Full Load, Delta Load

### Schritt 2: Schema analysieren

```sql
-- Spalten und Typen auslesen
SELECT c.name, t.name AS data_type, c.max_length, c.precision, c.scale,
       c.is_nullable, c.column_id
FROM sys.columns c
JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('<schema>.<table>')
ORDER BY c.column_id;

-- Indizes
SELECT i.name, i.type_desc, STRING_AGG(c.name, ', ') AS columns
FROM sys.indexes i
JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
WHERE i.object_id = OBJECT_ID('<schema>.<table>')
GROUP BY i.name, i.type_desc;
```

### Schritt 3: Abhängigkeiten ermitteln

```sql
-- Welche Objekte referenziert das Objekt? (Views)
SELECT DISTINCT referenced_schema_name, referenced_entity_name
FROM sys.dm_sql_referenced_entities('<schema>.<object>', 'OBJECT');

-- Wer referenziert dieses Objekt?
SELECT DISTINCT referencing_schema_name, referencing_entity_name
FROM sys.dm_sql_referencing_entities('<schema>.<object>', 'OBJECT');
```

### Schritt 4: dbt Model erstellen

Je nach Objekttyp, verwende das passende Template:

#### Raw Vault Hub
→ Verwende `.github/copilot/skills/create-dv-entity/templates/hub.sql`

#### Raw Vault Satellite
→ Verwende `.github/copilot/skills/create-dv-entity/templates/satellite.sql`

#### Raw Vault Link
→ Verwende `.github/copilot/skills/create-dv-link/templates/link.sql`

#### Business Vault
```sql
{{ config(
    materialized='incremental',
    incremental_strategy='append',
    schema='vault',
    as_columnstore=false
) }}
-- Business Logik aus WS Custom Function übersetzen
-- custom_func_<object_name> → dbt SQL
```

#### Dimension
→ Verwende `.github/copilot/skills/create-mart-object/templates/dim.sql`

#### Faktentabelle
→ Verwende `.github/copilot/skills/create-mart-object/templates/fakt.sql`

### Schritt 5: Custom Function übersetzen

Falls das WS-Objekt eine Custom Function hat:

1. **Code extrahieren**: Custom Function SQL aus RED kopieren/aus sqlbi01 lesen
2. **dss_* Attribute mappen**:
   - `dss_tenant_key` → `'default'` (Single-Tenant)
   - `dss_load_datetime` → `dss_load_date` (automate_dv Konvention)
   - `dss_record_source` → Format `{system}.{db}.{schema}.{table}`
   - `dss_business_key` → `CONCAT_WS('||', 'default', 'default', BK1, ..., BKn)`
   - `dss_sec_value_key` → `'-1'` (kein RLS im PoC)
   - `dss_deleted` → Noch nicht implementiert
3. **SQL übersetzen**: WS-spezifische Syntax → Standard T-SQL + dbt Jinja
4. **Abhängigkeiten**: WS Tabellennamen → `{{ ref('...') }}`

### Schritt 6: Validieren

```bash
# 1. Kompilieren
dbt compile --select <model_name>

# 2. Compiled SQL prüfen
# - CONVERT statt CAST für Hashes
# - NULL → '-1' Behandlung
# - LTRIM/RTRIM auf Hash-Spalten
# - Alphabetische BK-Sortierung

# 3. Tests ausführen (nach dbt run)
dbt test --select <model_name>
```

### Schritt 7: Dokumentieren

1. Schema YAML aktualisieren (`_<concept>__models.yml`)
2. ER-Diagramm aktualisieren (`design/raw-vault/<concept>/er-diagram.mmd`)
3. Confluence System-Doku prüfen (via @confluence-sync)
4. Confluence Benutzer-Doku prüfen (via @confluence-sync)

## Ergebnis

Nach erfolgreicher Migration:
- [ ] dbt Model erstellt und kompiliert
- [ ] Schema YAML dokumentiert
- [ ] Tests definiert (not_null, unique, referential integrity)
- [ ] ER-Diagramm aktualisiert
- [ ] Confluence-Dokumentation synchronisiert
