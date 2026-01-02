---
description: Listet Tabellen in einem Schema
tools: [datavault-agent]
---

# Tabellen auflisten: {{SCHEMA}}

Zeige alle Tabellen und Views in einem Schema.

## Tabellen abrufen

```
Tool: list_tables
Args: { "schema": "{{SCHEMA}}" }
```

## Erwartete Ausgabe für `vault`:

```
═══════════════════════════════════════
Tabellen in: [vault]
═══════════════════════════════════════

🗄️ HUBS
──────────────────────────────────────
  hub_company            1,234 rows
  hub_country              195 rows
  hub_product            5,678 rows

🗄️ SATELLITES
──────────────────────────────────────
  sat_company            2,456 rows
  sat_company_status     3,789 rows
  sat_country              195 rows

🔗 LINKS
──────────────────────────────────────
  link_company_country   1,234 rows
  link_company_product   8,901 rows

📊 PIT/BRIDGE
──────────────────────────────────────
  pit_company           45,678 rows
```

## Erwartete Ausgabe für `stg`:

```
═══════════════════════════════════════
Tabellen in: [stg]
═══════════════════════════════════════

📥 EXTERNAL TABLES
──────────────────────────────────────
  ext_company           (Parquet → ADLS)
  ext_country           (Parquet → ADLS)
  ext_product           (Parquet → ADLS)

📋 STAGING VIEWS
──────────────────────────────────────
  stg_company           (View)
  stg_country           (View)
  stg_product           (View)
```

## Verwendung

```
/db-tables vault
/db-tables stg
/db-tables mart
```
