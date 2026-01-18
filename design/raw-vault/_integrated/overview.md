# Raw Vault Design - Integrated

> Schema: `vault`

Übergreifende Data Vault Objekte die aus mehreren Quellsystemen zusammengeführt werden.

## Konzept

```mermaid
flowchart TB
    subgraph Sources["Quellsystem-spezifische Vaults"]
        WP["vault_werkportal.hub_company"]
        JIRA["vault_jira.hub_company"]
        CRM["vault_crm.hub_company"]
    end
    
    subgraph Integrated["Integrierter Vault"]
        HUB["vault.hub_company<br/>(Master)"]
        SAT["vault.sat_company_master"]
    end
    
    WP --> HUB
    JIRA --> HUB
    CRM --> HUB
    HUB --> SAT
```

## Wann hier?

Ein Objekt gehört in `vault` (integriert) wenn:

1. **Mehrere Quellen** - Entity existiert in mehreren Quellsystemen
2. **Master-Referenz** - Dient als zentrale Referenz für andere Systeme
3. **Cross-System Links** - Link verbindet Entities aus verschiedenen Quellsystemen

## Beispiele

| Objekt | Grund |
|--------|-------|
| `hub_company` | Company existiert in Werkportal, CRM, ERP |
| `link_company_customer` | Verbindet Werkportal-Company mit CRM-Customer |
| `sat_company_golden` | Golden Record aus mehreren Quellen |

## Aktuell implementiert

*Noch keine integrierten Objekte - alle Objekte sind aktuell quellsystem-spezifisch.*
