---
description: Zeigt Datenvorschau
tools: [datavault-agent]
---

# Datenvorschau: {{TABLE_NAME}}

Zeige Beispieldaten aus einer Tabelle oder View.

## Vorschau abrufen

```
Tool: preview_data
Args: { 
  "tableName": "{{TABLE_NAME}}",
  "schema": "{{SCHEMA}}",
  "limit": {{LIMIT}}
}
```

## Erwartete Ausgabe

```
═══════════════════════════════════════
Vorschau: [{{SCHEMA}}].[{{TABLE_NAME}}]
═══════════════════════════════════════
Zeige {{LIMIT}} von 1,234 Zeilen

┌────────────────────────────────────────────────────────────────────────────┐
│ hk_company       │ company_id │ name           │ status │ dss_load_date    │
├──────────────────┼────────────┼────────────────┼────────┼──────────────────┤
│ A3F2B1C9E8D7...  │ 1          │ Musterfirma    │ active │ 2024-01-15 10:30 │
│ B4C3D2E1F0A9...  │ 2          │ Beispiel GmbH  │ active │ 2024-01-15 10:30 │
│ C5D4E3F2A1B0...  │ 3          │ Test AG        │ pending│ 2024-01-15 10:30 │
└──────────────────┴────────────┴────────────────┴────────┴──────────────────┘
```

## Mit Filter (WHERE)

```
Tool: run_query
Args: {
  "query": "SELECT TOP 10 * FROM [{{SCHEMA}}].[{{TABLE_NAME}}] WHERE status = 'active'"
}
```

## Optionen

- `{{LIMIT}}`: Anzahl Zeilen (Standard: 10, Max: 100)
- `{{SCHEMA}}`: Schema (Standard: vault)

## Verwendung

```
/db-preview hub_company
/db-preview sat_company 20
/db-preview ext_company stg 5
```
