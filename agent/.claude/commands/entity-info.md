---
description: Zeigt Details zu einer Entity
tools: [datavault-agent]
context:
  - docs/MODEL_ARCHITECTURE.md
---

# Entity Info: {{ENTITY_NAME}}

Zeige detaillierte Informationen zu einer Data Vault Entity.

## Details abrufen

```
Tool: get_entity_info
Args: { "entityName": "{{ENTITY_NAME}}" }
```

## Erwartete Ausgabe

### Für einen Hub:
```
═══════════════════════════════════════
Hub: hub_company
═══════════════════════════════════════

📍 Schema: vault
📄 Datei: models/raw_vault/hubs/hub_company.sql

🔑 Hash Key: hk_company
🏷️ Business Key: company_id

📊 Spalten:
  - hk_company (CHAR(64)) - Hash Key
  - company_id (INT) - Business Key
  - dss_load_date (DATETIME2)
  - dss_record_source (VARCHAR(50))

🔗 Verknüpft mit:
  - sat_company (Satellite)
  - link_company_country (Link)

📈 Statistiken:
  - Zeilen: 1,234
  - Letzte Aktualisierung: 2024-01-15 14:30
```

### Für einen Satellite:
```
═══════════════════════════════════════
Satellite: sat_company
═══════════════════════════════════════

📍 Schema: vault
📄 Datei: models/raw_vault/satellites/sat_company.sql

🔑 Hash Key: hk_company
🔗 Parent Hub: hub_company

📊 Payload-Spalten:
  - name (NVARCHAR(255))
  - status (VARCHAR(20))
  - created_date (DATE)

📜 History:
  - hd_company (CHAR(64)) - Hash Diff
  - dss_load_date (DATETIME2)
  - dss_is_current (BIT)
```

## Verwendung

```
/entity-info hub_company
/entity-info sat_company
/entity-info link_company_country
```
