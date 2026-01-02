---
description: Erstellt einen neuen Data Vault Link
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#53-link-erstellen
  - docs/MODEL_ARCHITECTURE.md
---

# Link erstellen: {{LINK_NAME}}

Du erstellst einen neuen Data Vault Link zwischen zwei oder mehr Hubs. Folge diesem Workflow:

## Schritt 1: Beteiligte Hubs prüfen

Prüfe ob alle beteiligten Hubs existieren:

```
Tool: list_entities
Args: { "entityType": "hub" }
```

**Warte auf Benutzerauswahl:**
> Welche Hubs sollen verlinkt werden?
> 
> **Verfügbare Hubs:**
> - hub_company
> - hub_country
> - hub_product
> ...
>
> Auswahl: [min. 2 Hubs kommasepariert]

## Schritt 2: Link-Art bestimmen

Frage:
> Welche Art von Link?
> 
> 1. **Standard-Link** - N:M Beziehung (z.B. company ↔ country)
> 2. **Hierarchical Link** - Parent/Child Beziehung (z.B. company → parent_company)
> 3. **Same-as Link** - Deduplizierung (z.B. company ↔ company_duplicate)
> 4. **Link mit Dependent Child Key** - Zusätzliche Attribute im Link

## Schritt 3: Fremdschlüssel-Spalten ermitteln

```
Tool: describe_table
Args: { 
  "tableName": "stg_{{SOURCE_ENTITY}}",
  "schema": "stg"
}
```

**Zeige Mapping-Optionen:**
> Welche Spalte(n) referenzieren den anderen Hub?
> 
> z.B. für `stg_company`:
> - `country_id` → hub_country
> - `parent_company_id` → hub_company (self-ref)

## Schritt 4: Link erstellen

```
Tool: create_link
Args: {
  "linkName": "{{LINK_NAME}}",
  "hubReferences": [
    { "hub": "hub_{{HUB1}}", "fkColumn": "{{FK_COLUMN1}}" },
    { "hub": "hub_{{HUB2}}", "fkColumn": "{{FK_COLUMN2}}" }
  ],
  "sourceModel": "{{SOURCE_MODEL}}"
}
```

## Schritt 5: Optional - Link Satellite

Falls zusätzliche Attribute:
> Link-Satellite erstellen für temporale Attribute der Beziehung?
> z.B. Gültigkeitsdatum, Beziehungstyp
>
> [Ja] → Erstelle sat_{{LINK_NAME}} mit relevanten Attributen

## Placeholders

- `{{LINK_NAME}}`: Name des Links (z.B. "company_country")
- `{{HUB1}}`, `{{HUB2}}`: Beteiligte Hubs
- `{{FK_COLUMN1}}`, `{{FK_COLUMN2}}`: Fremdschlüssel-Spalten
- `{{SOURCE_MODEL}}`: Staging View

## Beispiel

```
/create-link company_country
```

Erstellt `link_company_country` mit:
- `hk_link_company_country` (Hash Key)
- `hk_company` → hub_company
- `hk_country` → hub_country
