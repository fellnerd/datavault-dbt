---
description: Verbindet zur Azure SQL Datenbank
tools: [datavault-agent]
context:
  - docs/SYSTEM.md
---

# Datenbank verbinden

Stelle eine Verbindung zur Azure SQL Datenbank her.

## Verfügbare Targets

| Target | Database | Verwendung |
|--------|----------|------------|
| `dev` | Vault | Entwicklung |
| `werkportal` | Vault_Werkportal | Produktion |
| `ewb` | Vault_EWB | Produktion (geplant) |

## Verbindung herstellen

```
Tool: connect_database
Args: { "target": "{{TARGET}}" }
```

## Verbindungsstatus prüfen

```
Tool: run_command
Args: { "command": "dbt debug" }
```

## Erwartete Ausgabe

```
═══════════════════════════════════════
Datenbankverbindung
═══════════════════════════════════════

✓ Verbunden mit: sql-datavault-weu-001.database.windows.net
✓ Database: {{DATABASE}}
✓ Schema: vault, stg
✓ Authentifizierung: Azure CLI

Bereit für Abfragen.
```

## Bei Verbindungsproblemen

1. **Azure CLI Login prüfen:**
   ```bash
   az login
   az account show
   ```

2. **Firewall-Regeln prüfen:**
   - VM IP muss in Azure SQL Firewall erlaubt sein

3. **Target in profiles.yml prüfen:**
   ```yaml
   werkportal:
     type: fabric
     database: Vault_Werkportal
     authentication: cli
   ```

## Verwendung

```
/db-connect dev
/db-connect werkportal
```
