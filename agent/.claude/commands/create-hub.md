---
description: Erstellt einen neuen Data Vault Hub
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#51-hub-erstellen
  - docs/MODEL_ARCHITECTURE.md
---

# Hub erstellen: {{ENTITY_NAME}}

Du erstellst einen neuen Data Vault Hub. Folge diesem Workflow:

## Schritt 1: Validierung

Prüfe zuerst ob die Entity bereits existiert:

```
Tool: list_entities
Args: { "type": "hubs", "verbose": true }
```

Falls `hub_{{ENTITY_NAME}}` bereits existiert, informiere den User und frage ob er fortfahren möchte.

## Schritt 2: Source ermitteln

Frage den User nach der Staging-Quelle oder suche automatisch:

```
Tool: list_entities
Args: { "type": "staging" }
```

**Präsentiere Optionen:**
1. Vorhandene Staging View auswählen (z.B. stg_{{ENTITY_NAME}})
2. Neue Staging View erstellen → verwende `/create-staging`
3. Anderen Source-Namen eingeben

## Schritt 3: Business Key bestimmen

Frage den User:

> Welche Spalte(n) bilden den Business Key?
> 
> 1. `object_id` (Standard für Werkportal)
> 2. Composite Key (mehrere Spalten)
> 3. Andere Spalte eingeben

Bei Composite Key: Frage nach allen Spalten, getrennt durch Komma.

## Schritt 4: Hub erstellen

```
Tool: create_hub
Args: {
  "entityName": "{{ENTITY_NAME}}",
  "businessKeyColumns": {{BUSINESS_KEY_COLUMNS}},
  "sourceModel": "{{SOURCE_MODEL}}"
}
```

## Schritt 5: Validierung & nächste Schritte

Nach erfolgreicher Erstellung:

1. Zeige den erstellten Dateipfad
2. Frage: "Soll ich auch einen Satellite für {{ENTITY_NAME}} erstellen?"
3. Biete an: `dbt run --select hub_{{ENTITY_NAME}}`

## Placeholders

- `{{ENTITY_NAME}}`: Name der Entity (z.B. "product", "customer")
- `{{BUSINESS_KEY_COLUMNS}}`: Array von Business Key Spalten (z.B. ["object_id"])
- `{{SOURCE_MODEL}}`: Name der Staging View (z.B. "stg_product")

## Beispiel

```
/create-hub product
```

Erstellt `hub_product` mit Business Key `object_id` aus `stg_product`.
