---
description: Listet alle Data Vault Entities
tools: [datavault-agent]
context:
  - docs/MODEL_ARCHITECTURE.md
---

# Entities auflisten

Zeige alle Data Vault Entities im Projekt.

## Alle Entities

```
Tool: list_entities
Args: { "entityType": "all" }
```

## Nach Typ filtern

### Nur Hubs
```
Tool: list_entities
Args: { "entityType": "hub" }
```

### Nur Satellites
```
Tool: list_entities
Args: { "entityType": "satellite" }
```

### Nur Links
```
Tool: list_entities
Args: { "entityType": "link" }
```

### Staging Views
```
Tool: list_entities
Args: { "entityType": "staging" }
```

### Marts
```
Tool: list_entities
Args: { "entityType": "mart" }
```

## Ausgabe-Format

Die Ausgabe wird als übersichtliche Tabelle formatiert:

| Entity | Typ | Schema | Status |
|--------|-----|--------|--------|
| hub_company | Hub | vault | ✓ deployed |
| sat_company | Satellite | vault | ✓ deployed |
| link_company_country | Link | vault | ○ pending |

## Beispiele

```
/list-entities
/list-entities hub
/list-entities satellite
```
