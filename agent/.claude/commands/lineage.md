---
description: Zeigt Lineage einer Entity
tools: [datavault-agent]
context:
  - docs/MODEL_ARCHITECTURE.md
---

# Lineage: {{ENTITY_NAME}}

Zeige die Datenherkunft (Upstream) und Abhängigkeiten (Downstream) einer Entity.

## Lineage abrufen

```
Tool: show_lineage
Args: { "entityName": "{{ENTITY_NAME}}" }
```

## Ausgabe-Format

```
═══════════════════════════════════════
Lineage: hub_company
═══════════════════════════════════════

📥 UPSTREAM (Quellen)
────────────────────────────────────────

PostgreSQL (werkportal)
    │
    ▼
ext_company (External Table)
    │
    ▼
stg_company (Staging View)
    │
    ▼
┌─────────────┐
│ hub_company │ ◄── DU BIST HIER
└─────────────┘

📤 DOWNSTREAM (Abhängigkeiten)
────────────────────────────────────────

hub_company
    │
    ├──▶ sat_company
    │       │
    │       └──▶ pit_company
    │
    ├──▶ sat_company_status
    │
    ├──▶ link_company_country
    │       │
    │       └──▶ sat_eff_company_country
    │
    └──▶ company_current_v (Mart)

═══════════════════════════════════════
```

## Kompakte Ansicht

```
stg_company → hub_company → sat_company → pit_company → company_current_v
                         ↘ link_company_country → sat_eff_company_country
```

## Optionen

```
/lineage hub_company              # Bidirektional
/lineage hub_company --upstream   # Nur Quellen
/lineage hub_company --downstream # Nur Abhängigkeiten
```

## dbt Graph

Alternative über dbt:
```
Tool: run_command
Args: { "command": "dbt ls --select +{{ENTITY_NAME}}+" }
```

## Verwendung

```
/lineage hub_company
/lineage sat_company
/lineage company_current_v
```
