# Raw Vault Design

Entity-Relationship Diagramme für Hubs, Links und Satellites.

## Dateien

| Datei | Beschreibung |
|-------|--------------|
| `overview.md` | Gesamtübersicht Raw Vault |
| `hub_<entity>.md` | Hub mit zugehörigen Satellites |
| `link_<entities>.md` | Link mit Effectivity Satellites |

## Legende

```mermaid
erDiagram
    HUB_EXAMPLE {
        char64 hk_example PK "Hash Key"
        varchar bk_example "Business Key"
        datetime dss_load_date
        varchar dss_record_source
    }
    
    SAT_EXAMPLE {
        char64 hk_example PK,FK
        datetime dss_load_date PK
        char64 hd_example "Hash Diff"
        varchar attribute_1
        varchar attribute_2
        varchar dss_record_source
    }
    
    HUB_EXAMPLE ||--o{ SAT_EXAMPLE : "has"
```

## Templates

Siehe:
- [_template_hub.md](_template_hub.md)
- [_template_link.md](_template_link.md)
