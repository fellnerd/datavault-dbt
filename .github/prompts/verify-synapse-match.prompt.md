---
mode: agent
description: "Vergleicht die Data Vault Implementierung mit den bestehenden Synapse structured-tables Views"
---

# Synapse Referenz-Abgleich

Vergleiche die aktuelle DV-Implementierung mit den bestehenden Synapse Views als Referenz.

## Workflow

### 1. Synapse Views auflisten
Verbinde zu `tcp:arg-analytics-ewb-01-synapse-ws-ondemand.sql.azuresynapse.net,1433` (DB: `structured-tables`):
```sql
SELECT SCHEMA_NAME(schema_id) AS [schema], name
FROM sys.views
WHERE SCHEMA_NAME(schema_id) IN ('Finance', 'Projekt')
ORDER BY [schema], name
```

### 2. Für jede View: Schema + Beispieldaten lesen
```sql
-- Spalten
SELECT c.name, t.name AS type_name, c.max_length, c.precision, c.scale
FROM sys.columns c JOIN sys.types t ON c.user_type_id = t.user_type_id
WHERE c.object_id = OBJECT_ID('<schema>.<view>')
ORDER BY c.column_id

-- Beispieldaten + Zeilenanzahl
SELECT TOP 5 * FROM <schema>.<view>
SELECT COUNT(*) AS total_rows FROM <schema>.<view>
```

### 3. DV-Implementierung vergleichen
Wechsle zu `sql-analytics-ewb-001.database.windows.net` (datavault-dev):
- Prüfe ob entsprechende Staging/Vault/Mart Objekte existieren
- Vergleiche Spalten, Datentypen, Zeilenanzahlen

### 4. Mapping-Matrix erstellen
| Synapse View | Synapse Spalte | DV Staging | DV Hub/Sat | DV Mart | Match? |
|---|---|---|---|---|---|

### 5. Referenz-Dokument
Ergebnisse mit `azure-environment/docs/analysis/synapse-vergleich-analyse.md` abgleichen.
