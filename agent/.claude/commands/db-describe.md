---
description: Zeigt Tabellenstruktur
tools: [datavault-agent]
---

# Tabelle beschreiben: {{TABLE_NAME}}

Zeige die Spaltenstruktur einer Tabelle oder View.

## Struktur abrufen

```
Tool: describe_table
Args: { 
  "tableName": "{{TABLE_NAME}}",
  "schema": "{{SCHEMA}}"
}
```

## Erwartete Ausgabe

```
═══════════════════════════════════════
Tabelle: [{{SCHEMA}}].[{{TABLE_NAME}}]
═══════════════════════════════════════

📊 Spalten:
┌─────────────────────┬──────────────────┬──────────┬─────────┐
│ Spalte              │ Datentyp         │ Nullable │ Default │
├─────────────────────┼──────────────────┼──────────┼─────────┤
│ hk_company          │ CHAR(64)         │ NO       │         │
│ company_id          │ INT              │ NO       │         │
│ name                │ NVARCHAR(255)    │ YES      │         │
│ status              │ VARCHAR(20)      │ YES      │         │
│ dss_load_date       │ DATETIME2        │ NO       │         │
│ dss_record_source   │ VARCHAR(50)      │ NO       │         │
└─────────────────────┴──────────────────┴──────────┴─────────┘

🔑 Primärschlüssel: (keine - Data Vault Pattern)
📈 Indizes:
   - IX_hub_company_hk (hk_company)
   - IX_hub_company_bk (company_id)

📏 Statistiken:
   - Zeilen: 1,234
   - Speicher: 0.5 MB
```

## Für External Tables

```
═══════════════════════════════════════
External Table: [stg].[ext_company]
═══════════════════════════════════════

📂 Quelle: ADLS Gen2
📍 Pfad: werkportal/company/
📄 Format: PARQUET

📊 Spalten:
┌─────────────────────┬──────────────────┐
│ Spalte              │ Datentyp         │
├─────────────────────┼──────────────────┤
│ id                  │ INT              │
│ name                │ NVARCHAR(255)    │
│ country_id          │ INT              │
│ status              │ VARCHAR(20)      │
│ created_date        │ DATE             │
└─────────────────────┴──────────────────┘
```

## Verwendung

```
/db-describe hub_company vault
/db-describe ext_company stg
/db-describe company_current_v mart
```
