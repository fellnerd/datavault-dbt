# Link: {entity1}_{entity2}

## Beschreibung

{Beschreibung der Beziehung zwischen den Entities}

## Beziehungstyp

- **Kardinalität:** {1:n / n:m / 1:1}
- **Driving Key:** `hk_{entity1}` (für Effectivity Satellite)

## Entity-Relationship Diagramm

```mermaid
erDiagram
    HUB_{ENTITY1} {
        char64 hk_{entity1} PK
        varchar {entity1}_id BK
    }
    
    HUB_{ENTITY2} {
        char64 hk_{entity2} PK
        varchar {entity2}_id BK
    }
    
    LINK_{ENTITY1}_{ENTITY2} {
        char64 hk_{entity1}_{entity2} PK "SHA2_256(hk1+hk2)"
        char64 hk_{entity1} FK
        char64 hk_{entity2} FK
        datetime dss_load_date
        varchar dss_record_source
    }
    
    EFF_SAT_{ENTITY1}_{ENTITY2} {
        char64 hk_{entity1}_{entity2} PK,FK
        datetime dss_load_date PK
        datetime dss_start_date "Beziehung gültig ab"
        datetime dss_end_date "Beziehung gültig bis"
        varchar dss_record_source
    }
    
    HUB_{ENTITY1} ||--o{ LINK_{ENTITY1}_{ENTITY2} : "participates"
    HUB_{ENTITY2} ||--o{ LINK_{ENTITY1}_{ENTITY2} : "participates"
    LINK_{ENTITY1}_{ENTITY2} ||--o{ EFF_SAT_{ENTITY1}_{ENTITY2} : "has"
```

## Quell-Mapping

| Link-Spalte | Quelle | Kommentar |
|-------------|--------|-----------|
| `hk_{entity1}` | `stg_{source}.hk_{entity1}` | |
| `hk_{entity2}` | `stg_{source}.hk_{entity2}` | |

## dbt Models

- Link: `models/raw_vault/links/link_{entity1}_{entity2}.sql`
- Eff Sat: `models/raw_vault/satellites/eff_sat_{entity1}_{entity2}.sql`
