# Bridge: {entity1}_{entity2}

## Beschreibung

Bridge Table zur Denormalisierung der Beziehung zwischen `hub_{entity1}` und `hub_{entity2}`.

## Beteiligte Objekte

- `hub_{entity1}`
- `link_{entity1}_{entity2}`
- `hub_{entity2}`
- Optional: `link_{entity2}_{entity3}` (für Multi-Hop)

## Entity-Relationship Diagramm

```mermaid
erDiagram
    HUB_{ENTITY1} {
        char64 hk_{entity1} PK
    }
    
    HUB_{ENTITY2} {
        char64 hk_{entity2} PK
    }
    
    LINK_{ENTITY1}_{ENTITY2} {
        char64 hk_{entity1}_{entity2} PK
        char64 hk_{entity1} FK
        char64 hk_{entity2} FK
    }
    
    BRIDGE_{ENTITY1}_{ENTITY2} {
        char64 hk_{entity1} PK,FK
        char64 hk_{entity2} FK
        char64 hk_{entity1}_{entity2} FK
        datetime dss_load_date
    }
    
    HUB_{ENTITY1} ||--o{ BRIDGE_{ENTITY1}_{ENTITY2} : "flattened"
    HUB_{ENTITY2} ||--o{ BRIDGE_{ENTITY1}_{ENTITY2} : "flattened"
    LINK_{ENTITY1}_{ENTITY2} ||--o{ BRIDGE_{ENTITY1}_{ENTITY2} : "source"
```

## Anwendungsfall

```sql
-- Direkte Navigation von Entity1 zu Entity2 ohne JOINs über Link
SELECT 
    h1.{entity1}_id,
    h2.{entity2}_id,
    s2.attribute
FROM bridge_{entity1}_{entity2} b
JOIN hub_{entity1} h1 ON b.hk_{entity1} = h1.hk_{entity1}
JOIN hub_{entity2} h2 ON b.hk_{entity2} = h2.hk_{entity2}
JOIN sat_{entity2} s2 ON b.hk_{entity2} = s2.hk_{entity2}
```

## dbt Model

- Bridge: `models/business_vault/bridge_{entity1}_{entity2}.sql`
