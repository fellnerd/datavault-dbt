---
applyTo: '**'
---
## PROJEKT: Virtual Data Vault 2.1 auf Azure

Dieses Projekt implementiert eine virtualisierte Data Vault 2.1 Architektur als PoC für ein SaaS-Template.

## ARCHITEKTUR

### Komponenten
- **Source:** PostgreSQL (werkportal) → Synapse Pipeline → ADLS Gen2 Parquet
- **Staging:** Azure SQL External Tables (PolyBase) → `[stg].[ext_*]`
- **Transformation:** dbt Core auf Linux VM (10.0.0.25)
- **Target:** Azure SQL Database (`sql-datavault-weu-001.database.windows.net`)

### Datenfluss
```
PostgreSQL → Synapse Pipeline → ADLS Parquet → External Table → dbt View → dbt Hub/Sat/Link
```

### Schemas
- `stg` - External Tables und Staging Views
- `vault` - Data Vault Objekte (Hubs, Satellites, Links)

## NAMENSKONVENTIONEN

### Tabellen/Views
- Hub: `vault.hub_<entity>` (z.B. `hub_company_client`)
- Satellite: `vault.sat_<entity>` (z.B. `sat_company_client`)
- Link: `vault.link_<entity1>_<entity2>` (z.B. `link_company_country`)
- Staging View: `stg.stg_<entity>`
- External Table: `stg.ext_<entity>`

### Spalten
- Hash Key: `hk_<entity>` (SHA2_256, CHAR(64))
- Hash Diff: `hd_<entity>` (für Satellites)
- Business Key: Original-Name oder `<entity>_id`
- Metadata: `dss_` Prefix (dss_load_date, dss_record_source, dss_run_id)

## DBT BEFEHLE

```bash
# Auf der VM ausführen
cd ~/projects/datavault-dbt
source .venv/bin/activate

dbt debug          # Verbindung testen
dbt deps           # Packages installieren
dbt compile        # SQL generieren (ohne Ausführung)
dbt run            # Alle Models ausführen
dbt run --select hub_company_client  # Einzelnes Model
dbt test           # Tests ausführen
```

## WICHTIGE EINSTELLUNGEN

### Azure SQL Basic Tier Limitationen
- `as_columnstore: false` - Columnstore nicht verfügbar
- Incremental Strategy: `append`

### Hash-Berechnung (SQL Server)
```sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    ISNULL(CAST(column AS NVARCHAR(MAX)), '')
), 2)
```

## OFFENE PUNKTE

- [ ] Link-Models erstellen (z.B. link_company_country)
- [ ] Business Vault Views (PITs, Bridges)
- [ ] CI/CD Pipeline (Azure DevOps)
- [ ] Weitere Entities (contractor, supplier, countries)
- [ ] Inkrementellen Load testen
