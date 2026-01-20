---
description: Führt SQL Query aus
tools: [datavault-agent]
---

# SQL Query ausführen

Führe eine beliebige SQL-Abfrage aus.

## Query ausführen

```
Tool: run_query
Args: { "query": "{{QUERY}}" }
```

## Sicherheitshinweise

⚠️ **Vor der Ausführung:**
- Bei `DELETE`, `UPDATE`, `DROP` → Bestätigung einholen
- Bei `SELECT` ohne `TOP`/`LIMIT` → Warnung bei großen Tabellen
- Bei DDL-Statements → Nur in Dev-Umgebung

## Beispiele

### Hub-Daten abfragen
```sql
SELECT TOP 10 
  h.company_id,
  s.name,
  s.status
FROM vault.hub_company h
JOIN vault.sat_company s ON h.hk_company = s.hk_company
WHERE s.dss_is_current = 1
```

### Historische Daten
```sql
SELECT 
  h.company_id,
  s.name,
  s.dss_load_date AS gueltig_ab,
  LEAD(s.dss_load_date) OVER (PARTITION BY h.hk_company ORDER BY s.dss_load_date) AS gueltig_bis
FROM vault.hub_company h
JOIN vault.sat_company s ON h.hk_company = s.hk_company
WHERE h.company_id = 42
ORDER BY s.dss_load_date
```

### Staging-Daten prüfen
```sql
SELECT COUNT(*) AS cnt, status
FROM stg.stg_company
GROUP BY status
```

## Ausgabe-Format

```
═══════════════════════════════════════
Query-Ergebnis
═══════════════════════════════════════
3 Zeilen in 0.12s

┌────────────┬────────────────┬────────┐
│ company_id │ name           │ status │
├────────────┼────────────────┼────────┤
│ 1          │ Musterfirma    │ active │
│ 2          │ Beispiel GmbH  │ active │
│ 3          │ Test AG        │ pending│
└────────────┴────────────────┴────────┘
```

## Verwendung

```
/db-query SELECT TOP 10 * FROM vault.hub_company
```
