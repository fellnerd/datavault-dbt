---
description: Erstellt einen neuen Data Vault Satellite
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#52-satellite-erstellen
  - docs/MODEL_ARCHITECTURE.md
---

# Satellite erstellen: {{ENTITY_NAME}}

Du erstellst einen neuen Data Vault Satellite. Folge diesem Workflow:

## Schritt 1: Hub prüfen

Prüfe ob der zugehörige Hub existiert:

```
Tool: get_entity_info
Args: { "entityName": "hub_{{ENTITY_NAME}}" }
```

Falls Hub nicht existiert:
- Frage: "Hub `hub_{{ENTITY_NAME}}` existiert nicht. Soll ich ihn zuerst erstellen?"
- Bei "Ja" → verwende `/create-hub {{ENTITY_NAME}}`

## Schritt 2: Verfügbare Attribute ermitteln

Zeige alle verfügbaren Attribute aus der Staging-Quelle:

```
Tool: suggest_attributes
Args: { "entityName": "{{ENTITY_NAME}}" }
```

**Präsentiere als Auswahl:**
> Welche Attribute sollen in den Satellite aufgenommen werden?
> 
> **Verfügbar aus stg_{{ENTITY_NAME}}:**
> ☐ name
> ☐ status  
> ☐ description
> ☐ created_date
> ... (alle verfügbaren Attribute)
>
> Auswahl: [alle / bestimmte Nummern / kommaseparierte Namen]

## Schritt 3: Satellite erstellen

```
Tool: create_satellite
Args: {
  "entityName": "{{ENTITY_NAME}}",
  "payloadColumns": {{PAYLOAD_COLUMNS}},
  "sourceModel": "{{SOURCE_MODEL}}"
}
```

## Schritt 4: Tests & Validierung

Nach Erstellung:

```
Tool: validate_model
Args: { "modelName": "sat_{{ENTITY_NAME}}" }
```

Biete an:
1. "Tests hinzufügen?" → `/add-tests sat_{{ENTITY_NAME}}`
2. "dbt run ausführen?" → `dbt run --select sat_{{ENTITY_NAME}}`

## Placeholders

- `{{ENTITY_NAME}}`: Name der Entity (z.B. "product")
- `{{PAYLOAD_COLUMNS}}`: Array der Payload-Spalten
- `{{SOURCE_MODEL}}`: Staging View Name

## Beispiel

```
/create-satellite product
```

Interaktiv: Wähle Attribute aus stg_product für sat_product.
