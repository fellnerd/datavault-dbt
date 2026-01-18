# Raw Vault Design - Werkportal

> Schema: `vault_werkportal`

## Entity-Relationship Diagramm

```mermaid
erDiagram
    %% === HUBS ===
    HUB_COMPANY {
        char64 hk_company PK
        int company_id BK
        datetime dss_load_date
        varchar dss_record_source
    }
    
    HUB_COUNTRY {
        char64 hk_country PK
        int country_id BK
        datetime dss_load_date
        varchar dss_record_source
    }
    
    HUB_PROJECT {
        char64 hk_project PK
        int project_id BK
        datetime dss_load_date
        varchar dss_record_source
    }
    
    HUB_INVOICE {
        char64 hk_invoice PK
        int invoice_id BK
        datetime dss_load_date
        varchar dss_record_source
    }

    %% === SATELLITES ===
    SAT_COMPANY {
        char64 hk_company PK,FK
        datetime dss_load_date PK
        char64 hd_company
        varchar company_name
        varchar client_type
    }
    
    SAT_COUNTRY {
        char64 hk_country PK,FK
        datetime dss_load_date PK
        varchar country_name
        varchar country_code
    }
    
    SAT_PROJECT {
        char64 hk_project PK,FK
        datetime dss_load_date PK
        varchar project_name
        varchar project_status
    }
    
    SAT_INVOICE {
        char64 hk_invoice PK,FK
        datetime dss_load_date PK
        decimal amount
        date invoice_date
    }

    %% === LINKS ===
    LINK_COMPANY_COUNTRY {
        char64 hk_company_country PK
        char64 hk_company FK
        char64 hk_country FK
        datetime dss_load_date
    }
    
    LINK_COMPANY_ROLE {
        char64 hk_company_role PK
        char64 hk_company FK
        int role_id FK
        datetime dss_load_date
    }
    
    EFF_SAT_COMPANY_COUNTRY {
        char64 hk_company_country PK,FK
        datetime dss_load_date PK
        datetime dss_start_date
        datetime dss_end_date
    }

    %% === RELATIONSHIPS ===
    HUB_COMPANY ||--o{ SAT_COMPANY : "has"
    HUB_COUNTRY ||--o{ SAT_COUNTRY : "has"
    HUB_PROJECT ||--o{ SAT_PROJECT : "has"
    HUB_INVOICE ||--o{ SAT_INVOICE : "has"
    
    HUB_COMPANY ||--o{ LINK_COMPANY_COUNTRY : "located_in"
    HUB_COUNTRY ||--o{ LINK_COMPANY_COUNTRY : "has"
    LINK_COMPANY_COUNTRY ||--o{ EFF_SAT_COMPANY_COUNTRY : "has"
    
    HUB_COMPANY ||--o{ LINK_COMPANY_ROLE : "has_role"
```

## Quellsystem

- **Typ:** PostgreSQL (werkportal)
- **Pipeline:** Synapse → ADLS Parquet → External Table
- **Staging:** `stg.stg_*`

## Implementierungsstatus

| Objekt | dbt Model | Status |
|--------|-----------|--------|
| `hub_company` | `raw_vault/werkportal/hubs/hub_company.sql` | ⏳ Migration |
| `hub_country` | `raw_vault/werkportal/hubs/hub_country.sql` | ⏳ Migration |
| `hub_project` | `raw_vault/werkportal/hubs/hub_project.sql` | ⏳ Migration |
| `hub_invoice` | `raw_vault/werkportal/hubs/hub_invoice.sql` | ⏳ Migration |
| `sat_company` | `raw_vault/werkportal/satellites/sat_company.sql` | ⏳ Migration |
| `sat_country` | `raw_vault/werkportal/satellites/sat_country.sql` | ⏳ Migration |
| `link_company_country` | `raw_vault/werkportal/links/link_company_country.sql` | ⏳ Migration |
