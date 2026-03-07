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

### Schema-Naming-Konvention

| Layer | Ordner | Schema | Verwendung |
|-------|--------|--------|------------|
| Staging | `staging/` | `stg` | Alle Quellen |
| Raw Vault (common) | `raw_vault/_common/` | `vault` | Quell-übergreifende Objekte |
| Raw Vault (source) | `raw_vault/<concept>/` | `vault_<concept>` | Quellsystem-spezifische Objekte |
| Business Vault | `business_vault/` | `vault` | PITs, Bridges |
| Mart (common) | `mart/_common/` | `mart` | Geteilte Dimensionen |
| Mart (domain) | `mart/<concept>/` | `mart_<concept>` | Domain-spezifische Views |

**Pattern:** `_common` → Basis-Schema, `<concept>` → `<basis>_<concept>`

## NAMENSKONVENTIONEN

### Tabellen/Views
- Hub: `vault_<concept>.hub_<entity>` (z.B. `vault_werkportal.hub_company`)
- Satellite: `vault_<concept>.sat_<entity>` (z.B. `vault_werkportal.sat_company`)
- Link: `vault_<concept>.link_<entity1>_<entity2>` (z.B. `vault_werkportal.link_company_country`)
- Common Hub: `vault.hub_<entity>` (quell-übergreifend integriert)
- Staging View: `stg.<concept>_<entity>` (z.B. `stg.werkportal_company`)
- External Table: `stg.ext_<concept>_<entity>` (z.B. `stg.ext_werkportal_company`)

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
dbt run --select hub_company         # Einzelnes Model
dbt run --select raw_vault.werkportal  # Alle Werkportal Models
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

- [ ] Common Vault Objects (`raw_vault/_common/`) für integrierte Hubs
- [ ] Business Vault Views (PITs, Bridges)
- [ ] CI/CD Pipeline (Azure DevOps)
- [ ] Weitere Entities (contractor, supplier)
- [ ] Inkrementellen Load testen
