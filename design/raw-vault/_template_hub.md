# Hub: {entity_name}

## Beschreibung

{Kurze Beschreibung der Business Entity}

## Business Key

- **Quelle:** `{source_table}.{column}`
- **Datentyp:** `{datatype}`
- **Beispiel:** `{example_value}`

## Entity-Relationship Diagramm

```mermaid
erDiagram
    HUB_{ENTITY} {
        char64 hk_{entity} PK "SHA2_256({bk})"
        varchar {entity}_id BK "Business Key"
        datetime dss_load_date "Ladezeit"
        varchar dss_record_source "Quellsystem"
    }
    
    SAT_{ENTITY} {
        char64 hk_{entity} PK,FK
        datetime dss_load_date PK
        char64 hd_{entity} "Hash Diff"
        varchar attribute_1 "Beschreibung"
        varchar attribute_2 "..."
        varchar dss_record_source
    }
    
    SAT_{ENTITY}_EXT {
        char64 hk_{entity} PK,FK
        datetime dss_load_date PK
        char64 hd_{entity}_ext
        varchar extended_attr "Aus anderem System"
        varchar dss_record_source
    }
    
    HUB_{ENTITY} ||--o{ SAT_{ENTITY} : "has"
    HUB_{ENTITY} ||--o{ SAT_{ENTITY}_EXT : "has"
```

## Satellites

| Satellite | Quelle | Attribute |
|-----------|--------|-----------|
| `sat_{entity}` | {source} | {attr1}, {attr2}, ... |
| `sat_{entity}_ext` | {other_source} | {ext_attr1}, ... |

## dbt Models

- Hub: `models/raw_vault/hubs/hub_{entity}.sql`
- Satellite: `models/raw_vault/satellites/sat_{entity}.sql`

## Referenzen

- Links: `link_{entity}_{other}`, `link_{other}_{entity}`
