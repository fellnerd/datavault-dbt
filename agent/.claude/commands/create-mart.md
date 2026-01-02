---
description: Erstellt ein Mart View für Endbenutzer
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#7-mart-layer
  - docs/USER.md
---

# Mart erstellen: {{MART_NAME}}

Du erstellst ein Mart View für Endbenutzer. Marts sind denormalisierte Views für Reporting und BI.

## Schritt 1: Anforderungen klären

> Für welchen Anwendungsfall wird das Mart benötigt?
>
> **Typische Mart-Typen:**
> 1. **Dimension** - Stammdaten (z.B. dim_company)
> 2. **Fact** - Transaktionen/Events (z.B. fact_orders)  
> 3. **Wide Flat** - Denormalisierte Sicht (z.B. company_current_v)
> 4. **Aggregated** - Voraggregiert (z.B. sales_monthly)

## Schritt 2: Quellen identifizieren

```
Tool: list_entities
Args: { "entityType": "all" }
```

> Welche Data Vault Objekte sollen einbezogen werden?
>
> **Hubs:**
> ☐ hub_company
> ☐ hub_country
> ...
>
> **Satellites:**
> ☐ sat_company (nur aktuelle Version?)
> ☐ sat_company_status
> ...
>
> **Links:**
> ☐ link_company_country

## Schritt 3: Temporale Anforderungen

> Welche Sicht auf die Daten?
>
> 1. **Current** - Nur aktueller Stand (Standard)
> 2. **Historical** - Alle Versionen mit Gültigkeitszeitraum
> 3. **As-of** - Stand zu einem bestimmten Datum
> 4. **Full** - Komplette Historie mit allen Änderungen

## Schritt 4: Mart erstellen

```
Tool: create_mart
Args: {
  "martName": "{{MART_NAME}}",
  "martType": "{{MART_TYPE}}",
  "sourceEntities": {{SOURCE_ENTITIES}},
  "includeHistory": {{INCLUDE_HISTORY}}
}
```

**Generierte Struktur für `company_current_v`:**
```sql
CREATE VIEW [mart].[company_current_v] AS
SELECT 
  -- Business Key
  h.company_id,
  
  -- Satellite Attributes (aktuell)
  s.name,
  s.status,
  s.created_date,
  
  -- Linked Data (flach)
  c.country_name,
  
  -- Metadata
  s.dss_load_date AS last_updated
FROM [vault].[hub_company] h
LEFT JOIN [vault].[sat_company] s 
  ON h.hk_company = s.hk_company
  AND s.dss_is_current = 1
LEFT JOIN [vault].[link_company_country] l
  ON h.hk_company = l.hk_company
LEFT JOIN [vault].[hub_country] c
  ON l.hk_country = c.hk_country
```

## Schritt 5: Dokumentation

Nach Erstellung:
- [ ] Beschreibung in schema.yml ergänzen
- [ ] Spaltenbeschreibungen hinzufügen
- [ ] In docs/USER.md dokumentieren

## Placeholders

- `{{MART_NAME}}`: Name des Marts (z.B. "company_current_v")
- `{{MART_TYPE}}`: dimension, fact, wide_flat, aggregated
- `{{SOURCE_ENTITIES}}`: Array der Quell-Entities
- `{{INCLUDE_HISTORY}}`: true/false

## Beispiel

```
/create-mart company_current_v
```

Erstellt denormalisiertes View mit aktuellen Company-Daten.
