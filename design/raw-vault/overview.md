# Raw Vault - Gesamtübersicht

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
    
    HUB_CUSTOMER {
        char64 hk_customer PK
        int customer_id BK
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
    
    SAT_CUSTOMER {
        char64 hk_customer PK,FK
        datetime dss_load_date PK
        varchar first_name
        varchar last_name
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

    %% === RELATIONSHIPS ===
    HUB_COMPANY ||--o{ SAT_COMPANY : "has"
    HUB_COUNTRY ||--o{ SAT_COUNTRY : "has"
    HUB_CUSTOMER ||--o{ SAT_CUSTOMER : "has"
    HUB_PROJECT ||--o{ SAT_PROJECT : "has"
    HUB_INVOICE ||--o{ SAT_INVOICE : "has"
    
    HUB_COMPANY ||--o{ LINK_COMPANY_COUNTRY : "located_in"
    HUB_COUNTRY ||--o{ LINK_COMPANY_COUNTRY : "has"
    
    HUB_COMPANY ||--o{ LINK_COMPANY_ROLE : "has_role"
```

## Implementierungsstatus

| Objekt | Status | dbt Model |
|--------|--------|-----------|
| `hub_company` | ✅ | `models/raw_vault/hubs/hub_company.sql` |
| `hub_country` | ✅ | `models/raw_vault/hubs/hub_country.sql` |
| `hub_customer` | ✅ | `models/raw_vault/hubs/hub_customer.sql` |
| `hub_project` | ✅ | `models/raw_vault/hubs/hub_project.sql` |
| `hub_invoice` | ✅ | `models/raw_vault/hubs/hub_invoice.sql` |
| `sat_company` | ✅ | `models/raw_vault/satellites/sat_company.sql` |
| `sat_country` | ✅ | `models/raw_vault/satellites/sat_country.sql` |
| `sat_customer` | ✅ | `models/raw_vault/satellites/sat_customer.sql` |
| `sat_project` | ✅ | `models/raw_vault/satellites/sat_project.sql` |
| `sat_invoice` | ✅ | `models/raw_vault/satellites/sat_invoice.sql` |
| `link_company_country` | ✅ | `models/raw_vault/links/link_company_country.sql` |
| `link_company_role` | ✅ | `models/raw_vault/links/link_company_role.sql` |
| `eff_sat_company_country` | ✅ | `models/raw_vault/satellites/eff_sat_company_country.sql` |
