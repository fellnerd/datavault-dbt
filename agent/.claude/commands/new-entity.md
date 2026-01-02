---
description: Kompletter Workflow für neue Entity
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md
  - CLAUDE.md
---

# Neue Entity: {{ENTITY_NAME}}

Kompletter Workflow um eine neue Entity von der Quelle bis zum Mart zu erstellen.

## Übersicht

```
┌──────────────────────────────────────────────────────────────┐
│                    Entity Workflow                           │
├──────────────────────────────────────────────────────────────┤
│  1. External Table  →  2. Staging  →  3. Hub  →  4. Sat     │
│                                       └──→  5. Link(s)       │
│                                              └──→ 6. Mart    │
└──────────────────────────────────────────────────────────────┘
```

## Schritt 1: External Table prüfen/erstellen

Prüfe ob Parquet-Daten verfügbar sind:

```
Tool: describe_table
Args: { "tableName": "ext_{{ENTITY_NAME}}", "schema": "stg" }
```

**Falls nicht vorhanden:**
1. Füge Definition zu `sources.yml` hinzu
2. `dbt run-operation stage_external_sources`

## Schritt 2: Staging View erstellen

```
/create-staging {{ENTITY_NAME}}
```

→ Fragt nach Business Key
→ Generiert Hash Keys & Hash Diff

## Schritt 3: Hub erstellen

```
/create-hub {{ENTITY_NAME}}
```

→ Verwendet Business Key aus Staging
→ Erstellt `hub_{{ENTITY_NAME}}.sql`

## Schritt 4: Satellite erstellen

```
/create-satellite {{ENTITY_NAME}}
```

→ Zeigt verfügbare Attribute
→ Fragt nach Auswahl
→ Erstellt `sat_{{ENTITY_NAME}}.sql`

## Schritt 5: Links erstellen (optional)

Prüfe Fremdschlüssel in Staging:

```
Tool: suggest_attributes
Args: { "entityName": "{{ENTITY_NAME}}" }
```

Für jeden erkannten FK:
```
/create-link {{ENTITY_NAME}}_{{REFERENCED_ENTITY}}
```

## Schritt 6: Mart erstellen (optional)

```
/create-mart {{ENTITY_NAME}}_current_v
```

## Schritt 7: Deployment

```
Tool: run_command
Args: { 
  "command": "dbt run --select stg_{{ENTITY_NAME}} hub_{{ENTITY_NAME}} sat_{{ENTITY_NAME}}" 
}
```

## Checkliste

- [ ] External Table definiert und zugänglich
- [ ] Staging View mit korrekten Hash-Berechnungen
- [ ] Hub mit eindeutigem Business Key
- [ ] Satellite(s) mit Payload-Spalten
- [ ] Links zu referenzierten Entities
- [ ] Tests hinzugefügt
- [ ] Dokumentation aktualisiert

## Verwendung

```
/new-entity product
/new-entity contractor
/new-entity supplier
```
