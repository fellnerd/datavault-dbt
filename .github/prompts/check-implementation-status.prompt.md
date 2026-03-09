---
mode: agent
description: "Prüft den aktuellen Implementierungsstand des EWB Data Vault Projekts (dbt-Modelle + DB-Objekte + Scope)"
---

# Implementierungsstatus prüfen

Ermittle den vollständigen Implementierungsstand des EWB Data Vault Projekts.

## Workflow

### 1. dbt-Modelle scannen (Dateisystem)
```
models/staging/ewb_*.sql           → EWB Staging Views
models/raw_vault/ewb/hubs/         → EWB Hubs
models/raw_vault/ewb/satellites/   → EWB Satellites
models/raw_vault/ewb/links/        → EWB Links
```

### 2. DB-Objekte prüfen (Azure SQL)
Verbinde zu `sql-analytics-ewb-001.database.windows.net` (datavault-dev):
```sql
-- Schemas
SELECT name FROM sys.schemas WHERE name IN ('stg', 'vault', 'bv', 'mart')

-- External Tables
SELECT name FROM sys.external_tables WHERE name LIKE 'ext_ewb_%'

-- Staging Views
SELECT name FROM sys.views WHERE SCHEMA_NAME(schema_id) = 'stg' AND name LIKE 'ewb_%'

-- Vault Objects
SELECT name, type_desc FROM sys.objects WHERE SCHEMA_NAME(schema_id) = 'vault'

-- Row Counts
SELECT SCHEMA_NAME(t.schema_id) AS [schema], t.name, p.rows
FROM sys.tables t JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
WHERE SCHEMA_NAME(t.schema_id) LIKE '%ewb%'
```

### 3. Scope-Abgleich
Vergleiche mit den 19 Pilot-Tabellen aus `azure-environment/docs/projektdokumentation.md`:

**Finance:** FIBU.GL (E22-E26), FIBU.FHE, KRED.KBL, KRED.KVL, KRED.KBS
**Projects:** PROJ.NPO, PROJ.NTC, PROJ.NTCA, PROJ.NTCE, PROJ.NTB, PROJ.NSA, PROJ.NTR, PROJ.PST, PROJ.PRT, LOHN.LEN, LOHN.LTC, PUBL.ADR

### 4. Gap-Analyse Report erstellen
| Tabelle | Staging | Hub | Satellite | Link | Status |
|---------|---------|-----|-----------|------|--------|
