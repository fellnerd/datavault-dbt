# Business Vault - Gesamtübersicht

## Entity-Relationship Diagramm

```mermaid
erDiagram
    %% === PITs ===
    PIT_COMPANY {
        char64 hk_company PK
        datetime dss_load_date PK
        datetime sat_company_ldts FK
        datetime sat_company_ext_ldts FK
    }

    %% === Referenzen zu Raw Vault ===
    HUB_COMPANY {
        char64 hk_company PK
    }
    
    SAT_COMPANY {
        char64 hk_company PK,FK
        datetime dss_load_date PK
    }
    
    SAT_COMPANY_EXT {
        char64 hk_company PK,FK
        datetime dss_load_date PK
    }

    %% === Relationships ===
    HUB_COMPANY ||--|| PIT_COMPANY : "indexed_by"
    PIT_COMPANY }o--|| SAT_COMPANY : "points_to"
    PIT_COMPANY }o--|| SAT_COMPANY_EXT : "points_to"
```

## Implementierungsstatus

| Objekt | Status | dbt Model | Beschreibung |
|--------|--------|-----------|--------------|
| `pit_company` | ✅ | `models/business_vault/pit_company.sql` | PIT für Company |
| `bridge_company_projects` | ⏳ | - | Geplant |

## Geplante Erweiterungen

### Bridges

```mermaid
flowchart LR
    subgraph "Bridge: Company → Projects → Invoices"
        HC[hub_company]
        LP[link_company_project]
        HP[hub_project]
        LI[link_project_invoice]
        HI[hub_invoice]
        
        HC --> LP --> HP --> LI --> HI
    end
    
    BRIDGE["bridge_company_invoices"]
    
    HC -.->|"denormalized"| BRIDGE
    HI -.->|"denormalized"| BRIDGE
```

### Berechnete Satellites

- `sat_company_calculated` - KPIs wie Umsatz, Anzahl Projekte
- `sat_customer_calculated` - Customer Lifetime Value
