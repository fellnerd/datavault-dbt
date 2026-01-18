# Raw Vault - Werkportal

> Schema: `vault_werkportal`

Data Vault Objekte aus dem Werkportal Quellsystem (PostgreSQL).

## Quellsystem

- **Typ:** PostgreSQL
- **Pipeline:** Synapse → ADLS Parquet
- **Entities:** company, country, project, invoice

## Objekte

| Typ | Objekt | Beschreibung |
|-----|--------|--------------|
| Hub | `hub_company` | Unternehmen |
| Hub | `hub_country` | Länder |
| Hub | `hub_project` | Projekte |
| Hub | `hub_invoice` | Rechnungen |
| Sat | `sat_company` | Company Attribute |
| Sat | `sat_country` | Country Attribute |
| Link | `link_company_country` | Company → Country Beziehung |
