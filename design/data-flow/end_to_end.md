# End-to-End Datenfluss

## Gesamtarchitektur

```mermaid
flowchart TB
    subgraph Sources["🗄️ Quellsysteme"]
        PG[(PostgreSQL<br/>werkportal)]
        AW[(SQL Server<br/>AdventureWorks)]
        API[/REST API<br/>Tempo/]
    end
    
    subgraph Integration["⚙️ Azure Integration"]
        SYN[Synapse<br/>Pipeline]
        ADLS[("ADLS Gen2<br/>Parquet Files")]
    end
    
    subgraph Staging["📥 Staging Layer"]
        EXT["External Tables<br/>(stg.ext_*)"]
        STG["Staging Views<br/>(stg.stg_*)"]
    end
    
    subgraph RawVault["🏛️ Raw Vault"]
        HUBS["Hubs<br/>(vault.hub_*)"]
        LINKS["Links<br/>(vault.link_*)"]
        SATS["Satellites<br/>(vault.sat_*)"]
    end
    
    subgraph BusinessVault["📊 Business Vault"]
        PITS["PITs<br/>(vault.pit_*)"]
        BRIDGES["Bridges<br/>(vault.bridge_*)"]
        CALC["Calculated Sats"]
    end
    
    subgraph Mart["📈 Data Mart"]
        DIM["Dimensions<br/>(mart.dim_*)"]
        FACT["Facts<br/>(mart.fact_*)"]
        VIEWS["Views<br/>(mart.v_*)"]
    end
    
    %% Connections
    PG --> SYN
    AW --> SYN
    API --> SYN
    SYN --> ADLS
    
    ADLS --> EXT
    EXT --> STG
    
    STG --> HUBS
    STG --> LINKS
    STG --> SATS
    
    HUBS --> PITS
    SATS --> PITS
    LINKS --> BRIDGES
    HUBS --> BRIDGES
    SATS --> CALC
    
    PITS --> DIM
    BRIDGES --> FACT
    CALC --> FACT
    DIM --> VIEWS
    FACT --> VIEWS
```

## Schicht-Details

### 1. Quellsysteme → ADLS

| Quelle | Pipeline | Ziel-Pfad | Frequenz |
|--------|----------|-----------|----------|
| werkportal.company_client | pl_werkportal | `/raw/werkportal/company_client/` | Daily |
| werkportal.countries | pl_werkportal | `/raw/werkportal/countries/` | Daily |
| AdventureWorks.Customer | pl_adventureworks | `/raw/aw/customer/` | Daily |

### 2. ADLS → Staging

```mermaid
flowchart LR
    PARQUET[/"company_client/*.parquet"/]
    EXT["ext_company_client<br/>(External Table)"]
    STG["stg_company<br/>(View)"]
    
    PARQUET -->|"OPENROWSET"| EXT
    EXT -->|"+ hk_company<br/>+ hd_company<br/>+ dss_*"| STG
```

### 3. Staging → Raw Vault

```mermaid
flowchart LR
    STG["stg_company"]
    
    HUB["hub_company"]
    SAT["sat_company"]
    LINK["link_company_country"]
    
    STG -->|"hk, bk, dss"| HUB
    STG -->|"hk, hd, attrs"| SAT
    STG -->|"hk_company,<br/>hk_country"| LINK
```

### 4. Raw Vault → Business Vault

```mermaid
flowchart LR
    HUB["hub_company"]
    SAT1["sat_company"]
    SAT2["sat_company_ext"]
    
    PIT["pit_company"]
    
    HUB --> PIT
    SAT1 --> PIT
    SAT2 --> PIT
```

## dbt DAG (vereinfacht)

```mermaid
flowchart LR
    subgraph Staging
        stg_company
        stg_country
    end
    
    subgraph Hubs
        hub_company
        hub_country
    end
    
    subgraph Links
        link_company_country
    end
    
    subgraph Satellites
        sat_company
        sat_country
        eff_sat_company_country
    end
    
    subgraph BusinessVault
        pit_company
    end
    
    stg_company --> hub_company
    stg_company --> sat_company
    stg_country --> hub_country
    stg_country --> sat_country
    
    hub_company --> link_company_country
    hub_country --> link_company_country
    
    link_company_country --> eff_sat_company_country
    
    hub_company --> pit_company
    sat_company --> pit_company
```
