# Raw Vault - Integrated

> Schema: `vault`

Übergreifende Data Vault Objekte die aus mehreren Quellsystemen zusammengeführt werden.

## Verwendung

Objekte hier sind **quellsystem-unabhängig** und dienen als:
- Master-Hubs für Entities die in mehreren Systemen vorkommen
- Integrierte Links zwischen verschiedenen Quellsystemen
- Consolidated Satellites mit gemergten Attributen

## Beispiel

```sql
-- vault.hub_company: Integrierter Hub aus Werkportal + CRM
SELECT hk_company, company_id, dss_load_date, dss_record_source
FROM vault.hub_company
```
