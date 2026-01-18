# Source System Mapping

## Übersicht Quellsysteme

```mermaid
flowchart TB
    subgraph Sources["🗄️ Quellsysteme"]
        WP[(werkportal<br/>PostgreSQL)]
        AW[(AdventureWorks<br/>SQL Server)]
        TEMPO[(Tempo<br/>API)]
    end
    
    subgraph Pipeline["⚙️ Integration"]
        SYN[Synapse Pipeline]
    end
    
    subgraph Storage["☁️ ADLS Gen2"]
        direction TB
        P1[/werkportal/*.parquet/]
        P2[/adventureworks/*.parquet/]
        P3[/tempo/*.parquet/]
    end
    
    WP --> SYN
    AW --> SYN
    TEMPO --> SYN
    SYN --> P1
    SYN --> P2
    SYN --> P3
```

## Quellsystem: werkportal (PostgreSQL)

| Quelltabelle | Staging View | Hub | Satellite |
|--------------|--------------|-----|-----------|
| `company_client` | `stg_company` | `hub_company` | `sat_company` |
| `countries` | `stg_country` | `hub_country` | `sat_country` |
| `project` | `stg_project` | `hub_project` | `sat_project` |
| `invoice` | `stg_invoice` | `hub_invoice` | `sat_invoice` |

## Quellsystem: AdventureWorks

| Quelltabelle | Staging View | Hub | Satellite |
|--------------|--------------|-----|-----------|
| `Customer` | `stg_aw_customer` | `hub_customer` | `sat_customer` |

## Quellsystem: Tempo (Jira)

| Quelltabelle | Staging View | Hub | Satellite |
|--------------|--------------|-----|-----------|
| `worklog` | `stg_tempo_worklog` | - | - |
