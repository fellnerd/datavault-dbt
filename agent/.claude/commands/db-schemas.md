---
description: Listet Datenbank-Schemas
tools: [datavault-agent]
---

# Schemas auflisten

Zeige alle Schemas in der verbundenen Datenbank.

## Schemas abrufen

```
Tool: list_schemas
Args: {}
```

## Erwartete Ausgabe

```
═══════════════════════════════════════
Schemas in: {{DATABASE}}
═══════════════════════════════════════

📁 stg
   └── External Tables & Staging Views
   
📁 vault
   └── Raw Vault (Hubs, Satellites, Links)
   
📁 mart
   └── Business Marts

📁 dbo
   └── System Objects

📁 ref
   └── Reference/Lookup Tables
```

## Nach Schema filtern

Zeige Tabellen eines bestimmten Schemas:

```
/db-tables stg
/db-tables vault
```

## Verwendung

```
/db-schemas
```
