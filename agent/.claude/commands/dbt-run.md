---
description: Führt dbt run aus
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#4-dbt-befehle
---

# dbt run

Führe dbt Models aus.

## Alle Models ausführen

```
Tool: run_command
Args: { "command": "dbt run" }
```

## Einzelnes Model

```
Tool: run_command
Args: { "command": "dbt run --select {{MODEL_NAME}}" }
```

## Mit Abhängigkeiten

```
Tool: run_command
Args: { "command": "dbt run --select +{{MODEL_NAME}}" }
```
(Upstream-Abhängigkeiten zuerst)

```
Tool: run_command
Args: { "command": "dbt run --select {{MODEL_NAME}}+" }
```
(Model + Downstream)

## Nach Layer

```bash
# Nur Staging
dbt run --select staging.*

# Nur Hubs
dbt run --select raw_vault.hubs.*

# Nur Satellites
dbt run --select raw_vault.satellites.*

# Nur Marts
dbt run --select mart.*
```

## Mit Target (Tenant)

```
Tool: run_command
Args: { "command": "dbt run --target werkportal --select {{MODEL_NAME}}" }
```

## Erwartete Ausgabe

```
═══════════════════════════════════════
dbt run - Ergebnis
═══════════════════════════════════════

✓ stg_company ................. [OK in 1.2s]
✓ hub_company ................. [OK in 0.8s]
✓ sat_company ................. [OK in 1.5s]
✓ link_company_country ........ [OK in 0.9s]
✓ company_current_v ........... [OK in 0.6s]

═══════════════════════════════════════
Completed: 5 models | 0 errors | 0 skipped
Total time: 5.0s
═══════════════════════════════════════
```

## Bei Fehlern

```
✗ sat_company ................. [ERROR]
  
  Database Error:
  Invalid column name 'new_column'.
  
  → Prüfe ob Staging View aktualisiert wurde
  → Spalte in Quelle vorhanden?
```

## Verwendung

```
/dbt-run
/dbt-run hub_company
/dbt-run +sat_company
/dbt-run --target werkportal
```
