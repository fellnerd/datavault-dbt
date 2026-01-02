---
description: Erstellt eine Bridge-Tabelle
tools: [datavault-agent]
context:
  - docs/DEVELOPER.md#6-business-vault
  - docs/MODEL_ARCHITECTURE.md
---

# Bridge erstellen: {{BRIDGE_NAME}}

Du erstellst eine Bridge-Tabelle zur Navigation über mehrere Links. Bridges vereinfachen komplexe Pfade durch das Data Vault Modell.

## Schritt 1: Hub-zu-Hub Pfad bestimmen

```
Tool: show_lineage
Args: { "entityName": "hub_{{START_HUB}}" }
```

> Welcher Pfad soll durch die Bridge abgedeckt werden?
>
> **Start:** hub_{{START_HUB}}
> 
> **Verfügbare Pfade:**
> - hub_company → link_company_country → hub_country
> - hub_company → link_company_product → hub_product → link_product_category → hub_category
> ...
>
> **Ziel:** hub_{{END_HUB}}

## Schritt 2: Beteiligte Objekte identifizieren

```
Tool: list_entities
Args: { "entityType": "link" }
```

**Pfad-Komponenten:**
| Schritt | Objekt | Join-Key |
|---------|--------|----------|
| 1 | hub_{{START_HUB}} | hk_{{START_HUB}} |
| 2 | link_{{LINK1}} | hk_{{START_HUB}}, hk_{{HUB2}} |
| 3 | hub_{{HUB2}} | hk_{{HUB2}} |
| ... | ... | ... |

## Schritt 3: Bridge erstellen

```
Tool: create_bridge
Args: {
  "bridgeName": "{{BRIDGE_NAME}}",
  "startHub": "hub_{{START_HUB}}",
  "endHub": "hub_{{END_HUB}}",
  "pathComponents": {{PATH_COMPONENTS}}
}
```

**Generierte Struktur:**
```sql
bridge_{{BRIDGE_NAME}} (
  -- Start und Ziel
  hk_{{START_HUB}},
  hk_{{END_HUB}},
  
  -- Alle Zwischenschlüssel (optional)
  hk_{{INTERMEDIATE_HUB}},
  hk_link_{{LINK1}},
  
  -- Metadata
  dss_load_date,
  dss_record_source
)
```

## Schritt 4: Verwendung

**Query-Vereinfachung mit Bridge:**
```sql
-- Ohne Bridge: Multiple Joins
SELECT c.company_name, cat.category_name
FROM hub_company c
JOIN link_company_product lcp ON c.hk_company = lcp.hk_company
JOIN hub_product p ON lcp.hk_product = p.hk_product
JOIN link_product_category lpc ON p.hk_product = lpc.hk_product
JOIN hub_category cat ON lpc.hk_category = cat.hk_category

-- Mit Bridge: Direkter Zugriff
SELECT c.company_name, cat.category_name
FROM hub_company c
JOIN bridge_company_to_category br ON c.hk_company = br.hk_company
JOIN hub_category cat ON br.hk_category = cat.hk_category
```

## Placeholders

- `{{BRIDGE_NAME}}`: Name der Bridge (z.B. "company_to_category")
- `{{START_HUB}}`, `{{END_HUB}}`: Start- und Ziel-Hubs
- `{{PATH_COMPONENTS}}`: Array der Pfad-Elemente

## Beispiel

```
/create-bridge company_to_category
```

Erstellt `bridge_company_to_category` für direkten company→category Zugriff.
