# PIT: {entity_name}

## Beschreibung

Point-in-Time Table für `hub_{entity}` mit Snapshots aller zugehörigen Satellites.

## Beteiligte Satellites

| Satellite | Spalte im PIT |
|-----------|---------------|
| `sat_{entity}` | `sat_{entity}_load_date` |
| `sat_{entity}_ext` | `sat_{entity}_ext_load_date` |

## Entity-Relationship Diagramm

```mermaid
erDiagram
    HUB_{ENTITY} {
        char64 hk_{entity} PK
        varchar {entity}_id BK
    }
    
    SAT_{ENTITY} {
        char64 hk_{entity} PK,FK
        datetime dss_load_date PK
        varchar attribute_1
    }
    
    SAT_{ENTITY}_EXT {
        char64 hk_{entity} PK,FK
        datetime dss_load_date PK
        varchar ext_attribute
    }
    
    PIT_{ENTITY} {
        char64 hk_{entity} PK,FK
        datetime dss_load_date PK "Snapshot-Zeit"
        datetime sat_{entity}_ldts FK "→ sat_{entity}"
        datetime sat_{entity}_ext_ldts FK "→ sat_{entity}_ext"
    }
    
    HUB_{ENTITY} ||--o{ SAT_{ENTITY} : "has"
    HUB_{ENTITY} ||--o{ SAT_{ENTITY}_EXT : "has"
    HUB_{ENTITY} ||--|| PIT_{ENTITY} : "indexed_by"
    PIT_{ENTITY} }o--|| SAT_{ENTITY} : "points_to"
    PIT_{ENTITY} }o--|| SAT_{ENTITY}_EXT : "points_to"
```

## Snapshot-Intervall

- **Granularität:** {daily / hourly}
- **Retention:** {30 Tage / unbegrenzt}

## dbt Model

```sql
-- models/business_vault/pit_{entity}.sql
{{{{ config(materialized='incremental') }}}}

-- PIT-Logik hier
```

## Anwendungsfall

```sql
-- Alle Company-Daten zu einem bestimmten Zeitpunkt
SELECT 
    h.company_id,
    s.company_name,
    se.extended_attr
FROM pit_{entity} p
JOIN hub_{entity} h ON p.hk_{entity} = h.hk_{entity}
JOIN sat_{entity} s ON p.hk_{entity} = s.hk_{entity} 
    AND p.sat_{entity}_ldts = s.dss_load_date
JOIN sat_{entity}_ext se ON p.hk_{entity} = se.hk_{entity}
    AND p.sat_{entity}_ext_ldts = se.dss_load_date
WHERE p.dss_load_date = '2025-01-01'
```
