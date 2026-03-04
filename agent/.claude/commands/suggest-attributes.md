---
description: Schlägt Attribute für eine Entity vor
tools: [datavault-agent]
context:
  - models/staging/
---

# Attribute vorschlagen: {{ENTITY_NAME}}

Analysiere verfügbare Attribute aus der Staging-Quelle und schlage eine Hub/Sat-Aufteilung vor.

## Attribute ermitteln

```
Tool: suggest_attributes
Args: { "entityName": "{{ENTITY_NAME}}" }
```

## Erwartete Ausgabe

```
═══════════════════════════════════════
Attribute-Analyse: {{ENTITY_NAME}}
═══════════════════════════════════════

📥 Quelle: stg_{{ENTITY_NAME}}

🔑 Empfohlener Business Key:
   - {{ENTITY_NAME}}_id

📦 Empfehlung für Satellite-Aufteilung:

┌─────────────────────────────────────────────┐
│ sat_{{ENTITY_NAME}} (Stammdaten)            │
├─────────────────────────────────────────────┤
│ ✓ name                                      │
│ ✓ description                               │
│ ✓ created_date                              │
│ ✓ type_code                                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ sat_{{ENTITY_NAME}}_status (Häufig ändernd) │
├─────────────────────────────────────────────┤
│ ✓ status                                    │
│ ✓ last_modified                             │
│ ✓ modified_by                               │
└─────────────────────────────────────────────┘

🔗 Fremdschlüssel (→ Links):
   - country_id → hub_country
   - parent_id → hub_{{ENTITY_NAME}} (self-ref)

⚠️ Ignorierte Spalten:
   - _synapse_timestamp (technisch)
   - _file_path (technisch)
```

## Optionen nach Analyse

1. **Alle Attribute in einen Satellite**: `/create-satellite {{ENTITY_NAME}}`
2. **Split Satellites erstellen**: Separate Status-Satellite
3. **Links identifiziert**: `/create-link {{ENTITY_NAME}}_country`

## Verwendung

```
/suggest-attributes company
/suggest-attributes product
```
