# MDS dbt Integration

## Übersicht

Das Master Data Services (MDS) System verwendet ein eigenständiges dbt-Projekt für Datenbanktransformationen. Dieses Projekt ist vollständig unabhängig vom Data Vault dbt-Projekt und wird innerhalb des MDS Docker-Containers ausgeführt.

## Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MDS Service Container                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │  Next.js    │    │   Worker    │    │      dbt Project        │ │
│  │    API      │───▶│  (BullMQ)   │───▶│   /app/dbt/             │ │
│  └─────────────┘    └─────────────┘    │  - bootstrap_mds        │ │
│                                         │  - mds_customer.sql     │ │
│                                         └───────────┬─────────────┘ │
└───────────────────────────────────────────────────────┼─────────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Azure SQL Database                            │
├──────────────┬──────────────┬───────────────┬──────────────────────┤
│   mds_meta   │  mds_stage   │   mds_load    │     mds_master       │
│  (Metadaten) │  (Staging)   │   (Deploy)    │   (SCD2 Master)      │
├──────────────┼──────────────┼───────────────┼──────────────────────┤
│ model        │staged_record │load_customer  │ customer             │
│ entity       │              │load_*         │ product              │
│ attribute    │              │               │ supplier             │
│ view         │              │               │ ...                  │
└──────────────┴──────────────┴───────────────┴──────────────────────┘
```

## Projekt-Struktur

```
masterdata/
├── dbt/
│   ├── dbt_project.yml       # Projekt-Konfiguration
│   ├── profiles.yml          # DB-Verbindungen (dev/local/prod)
│   ├── packages.yml          # Externe Packages
│   ├── macros/
│   │   ├── bootstrap_mds.sql     # Bootstrap-Macro
│   │   ├── mds_scd2.sql          # SCD2 Helper Macros
│   │   └── generate_schema_name.sql
│   ├── models/
│   │   └── mds_master/
│   │       └── mds_customer.sql  # Customer SCD2 Model
│   └── run-dbt.sh            # Runner-Script für Worker
├── Dockerfile                # Container mit dbt
└── docker-compose.yml        # Service-Definition
```

## Schema-Struktur

### mds_meta (Metadaten)

| Tabelle | Spalten | Beschreibung |
|---------|---------|-------------|
| `model` | id, code, name, description, **version**, **status**, **source_database**, **target_schema**, is_active, created_at, created_by, updated_at, updated_by | MDM-Modelle (z.B. CUSTOMER_MDM) |
| `entity` | id, model_id, code, name, description, source_schema, source_table, target_schema, target_table, business_key_columns, **staging_view**, **hub_name**, **is_deployed**, **last_deployed_at**, **record_count**, is_active, created_at, created_by, updated_at, updated_by | Entities pro Model (z.B. Customer, Product) |
| `attribute` | id, entity_id, code, name, data_type, max_length, is_nullable, is_business_key, default_value, validation_regex, sort_order, created_at, created_by | Attribute pro Entity |
| `view` | id, entity_id, code, name, view_type, view_definition, is_active, created_at, created_by | View-Definitionen für Entities |

### mds_stage (Staging)

| Tabelle | Spalten | Beschreibung |
|---------|---------|-------------|
| `staged_record` | id, entity_id, business_key_hash, **business_key**, payload, **data**, **previous_data**, **commit_id**, operation, status, validation_errors, source_system, source_id, created_at, created_by, processed_at, processed_by | Eingehende Datensätze (JSON-Payload) |
| `commit` | id, code, description, status, created_at, created_by, approved_at, approved_by, deployed_at, deployed_by | Commit-Bundles für gestaffeltes Deployment |

### mds_load (Deploy Layer)

| Tabelle | Beschreibung |
|---------|-------------|
| `load_customer` | Deploy-Daten für Customer Entity |
| `load_*` | Weitere Entity-spezifische Load-Tabellen |

### mds_master (Master Tables)

| Tabelle | Beschreibung |
|---------|-------------|
| `customer` | Customer SCD Type 2 Master |
| `*` | Weitere Master-Tabellen |

## dbt Befehle

### Bootstrap (Container-Start)

Erstellt alle MDS-Schemas und Meta-Tabellen:

```bash
dbt run-operation bootstrap_mds --target prod
```

Wird automatisch bei Container-Start ausgeführt (Dockerfile CMD).

### Master Model ausführen

Führt SCD2-Transformation für Customer aus:

```bash
# Incremental (Standard)
dbt run --select mds_customer --target prod

# Full Refresh
dbt run --select mds_customer --target prod --full-refresh
```

### Worker-Aufrufe

Der Worker ruft dbt über das `run-dbt.sh` Script:

```bash
# Bootstrap
./run-dbt.sh bootstrap

# Deploy Entity
./run-dbt.sh deploy mds_customer

# Alle Master-Models
./run-dbt.sh run-master
```

## SCD Type 2 Implementierung

### Konzept

Das Customer-Model implementiert SCD Type 2 mit:
- **Soft Deletes**: Gelöschte Records werden als `is_deleted=1` markiert
- **Historisierung**: Jede Änderung erzeugt einen neuen Record
- **Current Flag**: `is_current=1` markiert den aktuellen Stand

### Datenfluss

```
1. API schreibt in mds_load.load_customer (is_processed=0)
2. dbt PRE-HOOK: Schließt bestehende aktuelle Records
   - UPDATE SET is_current=0, valid_to=NOW()
3. dbt SELECT: Fügt neue Versionen ein
   - INSERT mit is_current=1, valid_from=NOW()
4. dbt POST-HOOK: Markiert Load-Daten als verarbeitet
   - UPDATE SET is_processed=1
```

### Beispiel-Historie

```sql
SELECT business_key, city, is_current, is_deleted, valid_from, valid_to
FROM mds_master.customer
WHERE business_key = 'CUST001'
ORDER BY valid_from;
```

| business_key | city | is_current | is_deleted | valid_from | valid_to |
|-------------|------|-----------|-----------|------------|----------|
| CUST001 | Wien | 0 | 0 | 2026-01-09 13:25 | 2026-01-09 13:26 |
| CUST001 | Graz | 1 | 0 | 2026-01-09 13:26 | 9999-12-31 |

### Model-Konfiguration

```sql
{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias='customer',
    incremental_strategy='append',
    as_columnstore=false,  -- Azure SQL Basic Tier
    pre_hook=[...],        -- Close current records
    post_hook=[...]        -- Mark processed
  )
}}
```

## Environment Variables

| Variable | Beschreibung | Beispiel |
|----------|-------------|----------|
| `DBT_PROFILES_DIR` | Pfad zu profiles.yml | `/app/dbt` |
| `MDS_DB_SERVER` | Azure SQL Server | `sql-xxx.database.windows.net` |
| `MDS_DB_DATABASE` | Datenbank | `Vault` |
| `MDS_DB_USER` | SQL User | `sqladmin` |
| `MDS_DB_PASSWORD` | SQL Passwort | `***` |
| `MDS_DBT_TARGET` | dbt Target | `prod` |

## Profiles

```yaml
# profiles.yml
mds:
  target: dev
  outputs:
    dev:      # Azure CLI Auth (Entwicklung)
    local:    # SQL Auth (lokaler Test)
    prod:     # SQL Auth (Produktion)
```

## Neue Entity hinzufügen

### 1. Load-Tabelle erstellen

```sql
CREATE TABLE mds_load.load_product (
    load_id BIGINT IDENTITY(1,1) PRIMARY KEY,
    business_key NVARCHAR(255) NOT NULL,
    business_key_hash CHAR(64) NOT NULL,
    operation NVARCHAR(10) NOT NULL,
    -- Entity-spezifische Spalten
    product_id NVARCHAR(100),
    name NVARCHAR(255),
    category NVARCHAR(100),
    price DECIMAL(18,2),
    -- Metadata
    load_user NVARCHAR(100) DEFAULT 'system',
    load_timestamp DATETIME2 DEFAULT GETUTCDATE(),
    is_processed BIT DEFAULT 0
);
```

### 2. dbt Model erstellen

Kopiere `mds_customer.sql` als Template und passe an:

```sql
-- models/mds_master/mds_product.sql
{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias='product',
    ...
  )
}}
```

### 3. Entity registrieren

```sql
INSERT INTO mds_meta.entity (model_id, code, name, target_schema, target_table, business_key_columns)
VALUES (1, 'PRODUCT', 'Produkt', 'mds_master', 'product', 'product_id');
```

## Troubleshooting

### COLUMNSTORE Error

```
'COLUMNSTORE' is not supported in this service tier
```

**Lösung**: `as_columnstore: false` in dbt_project.yml oder Model-Config.

### Foreign Key Constraint Error

```
Cannot drop object because it is referenced by a FOREIGN KEY
```

**Lösung**: 
```sql
-- Alle FK Constraints in MDS Schemas löschen
DECLARE @sql NVARCHAR(MAX) = N'';
SELECT @sql = @sql + 'ALTER TABLE ... DROP CONSTRAINT ...;'
FROM sys.foreign_keys ...;
EXEC sp_executesql @sql;
```

### Bootstrap schlägt fehl

Falls der Bootstrap nicht funktioniert:

```bash
# Manuell ausführen
cd /app/dbt
dbt run-operation bootstrap_mds --target prod
```

## Performance-Tipps

1. **Batch-Verarbeitung**: Mehrere Records pro dbt run
2. **Indices**: Auf `business_key` und `is_current` 
3. **Partitionierung**: Für große Master-Tabellen
4. **Incremental Strategy**: `append` ist schneller als `merge`

## Referenzen

- [dbt Documentation](https://docs.getdbt.com/)
- [dbt-sqlserver Adapter](https://github.com/dbt-msft/dbt-sqlserver)
- [SCD Type 2 Pattern](https://en.wikipedia.org/wiki/Slowly_changing_dimension#Type_2:_add_new_row)
