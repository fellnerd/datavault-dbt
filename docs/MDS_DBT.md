# MDS dbt Integration

## Übersicht

Das Master Data Services (MDS) System verwendet ein eigenständiges dbt-Projekt für Datenbanktransformationen. Dieses Projekt ist vollständig unabhängig vom Data Vault dbt-Projekt und wird innerhalb des MDS Docker-Containers ausgeführt.

**Kernfeature: Dynamische Model-Generierung** - dbt Models werden automatisch aus den Metadaten (`mds_meta`) generiert. Kein manuelles SQL-Schreiben erforderlich!

## Architektur

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MDS Service Container                          │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────────────────┐ │
│  │  Next.js    │    │   Worker    │    │      dbt Project        │ │
│  │    API      │───▶│  (BullMQ)   │───▶│   /app/dbt/             │ │
│  └─────────────┘    └─────────────┘    │  - generate_models.py   │ │
│                                         │  - models/mds_load/     │ │
│                                         │  - models/mds_master/   │ │
│                                         │  - models/mds_view/     │ │
│                                         └───────────┬─────────────┘ │
└───────────────────────────────────────────────────────┼─────────────┘
                                                        │
                                                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Azure SQL Database                            │
├──────────────┬──────────────┬───────────────┬───────────┬──────────┤
│   mds_meta   │  mds_stage   │   mds_load    │mds_master │ mds_view │
│  (Metadaten) │  (Staging)   │ (dbt-erzeugt) │  (SCD2)   │  (Views) │
├──────────────┼──────────────┼───────────────┼───────────┼──────────┤
│ model        │staged_record │ country       │ country   │v_country │
│ entity       │ commit       │ customer      │ customer  │v_customer│
│ attribute    │              │ product       │ product   │ ...      │
│ entity_view  │              │ ...           │ ...       │          │
└──────────────┴──────────────┴───────────────┴───────────┴──────────┘
```

## Datenfluss

```
1. UI/API: Entity + Attribute definieren      → mds_meta.entity, mds_meta.attribute
2. UI/API: Daten stagen + committen           → mds_stage.staged_record, mds_stage.commit  
3. Commit genehmigen (UI)                     → commit.status = 'approved'
4. dbt run --select load_<entity>             → mds_load.<entity> (JSON → flach)
                                              → staged_record.status = 'loaded'
                                              → commit.status = 'loaded'
5. dbt run --select mds_<entity>              → mds_master.<entity> (SCD2)
                                              → mds_load.is_processed = 1
                                              → commit.status = 'deployed'
6. dbt run --select mds_view                  → mds_view.<view>
```

**Neuer 2-Stufen-dbt-Workflow (seit Januar 2026):**
- **Stufe 1 - Load:** `load_<entity>.sql` liest JSON aus `staged_record` → flache Tabelle in `mds_load`
- **Stufe 2 - Master:** `mds_<entity>.sql` liest `mds_load` → SCD2-Tabelle in `mds_master`

## Projekt-Struktur

```
masterdata/
├── dbt/
│   ├── dbt_project.yml           # Projekt-Konfiguration
│   ├── profiles.yml              # DB-Verbindungen (dev/local/prod)
│   ├── packages.yml              # Externe Packages
│   ├── scripts/
│   │   └── generate_models.py    # ⭐ Dynamischer Model-Generator
│   ├── macros/
│   │   ├── bootstrap_mds.sql     # Bootstrap-Macro
│   │   └── generate_schema_name.sql
│   ├── models/
│   │   ├── mds_load/             # ⭐ Load-Layer (JSON → flach)
│   │   │   └── load_country.sql  # Dynamisch generiert
│   │   ├── mds_master/           # Master-Tabellen (SCD2)
│   │   │   ├── mds_country.sql   # Dynamisch generiert
│   │   │   └── mds_customer.sql  # Dynamisch generiert
│   │   ├── mds_meta/             # Seed-Daten für Metadaten
│   │   └── mds_view/             # Views auf Master-Tabellen
│   │       └── v_country.sql     # Dynamisch generiert
│   └── run-dbt.sh                # Runner-Script für Worker
├── Dockerfile                    # Container mit dbt + Python
└── docker-compose.yml            # Service-Definition
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

### mds_load (Load Layer - dbt-erzeugt)

| Tabelle | Beschreibung |
|---------|-------------|
| `<entity>` | Flache Daten aus JSON (z.B. `country`, `customer`) - erzeugt durch `load_<entity>.sql` |
| `deployment_log` | Log aller Deployments |

**Spaltenstruktur mds_load.<entity>:**
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `business_key_hash` | CHAR(64) | SHA256 Hash des Business Key |
| `business_key` | NVARCHAR(255) | Business Key Wert |
| `<attribute>` | variabel | Entity-spezifische Attribute (JSON_VALUE extrahiert) |
| `commit_id` | INT | Referenz zum Commit |
| `operation` | NVARCHAR(20) | INSERT/UPDATE/DELETE |
| `source_system` | NVARCHAR(100) | Quellsystem ('MDS') |
| `source_id` | NVARCHAR(255) | ID im Quellsystem (staged_record.id) |
| `is_processed` | BIT | Verarbeitet durch mds_master dbt? |
| `created_at` | DATETIME2 | Erstellungszeitpunkt |
| `processed_at` | DATETIME2 | Verarbeitungszeitpunkt |

**Hinweis:** Die `id`-Spalte (IDENTITY) wird automatisch von SQL Server hinzugefügt, **nicht** im dbt-Model definiert!

### mds_master (Master Tables)

| Tabelle | Beschreibung |
|---------|-------------|
| `<entity>` | SCD Type 2 Master (z.B. `country`, `customer`) |

**Spaltenstruktur mds_master.<entity>:**
| Spalte | Typ | Beschreibung |
|--------|-----|--------------|
| `business_key` | NVARCHAR(255) | Business Key |
| `business_key_hash` | CHAR(64) | SHA256 Hash |
| `<attribute>` | variabel | Entity-spezifische Attribute |
| `valid_from` | DATETIME2 | Gültig ab |
| `valid_to` | DATETIME2 | Gültig bis (9999-12-31 = aktuell) |
| `is_current` | BIT | Aktueller Record? |
| `is_deleted` | BIT | Soft Delete Flag |
| `commit_id` | INT | Referenz zum Commit |
| `source_load_id` | BIGINT | ID aus mds_load |
| `created_at` | DATETIME2 | Erstellungszeitpunkt |
| `created_by` | NVARCHAR(100) | Erstellt von |

### mds_view (Views)

| View | Beschreibung |
|------|-------------|
| `<view_code>` | View auf Master-Tabelle (z.B. `v_country`) |

Views zeigen nur aktuelle, nicht gelöschte Records (`is_current=1 AND is_deleted=0`).

## dbt Befehle

### Bootstrap (Container-Start)

Erstellt alle MDS-Schemas und Meta-Tabellen:

```bash
export MDS_DB_USER=sqladmin
export MDS_DB_PASSWORD='<password>'

dbt run-operation bootstrap_mds --target local
```

Wird automatisch bei Container-Start ausgeführt (Dockerfile CMD).

### Dynamische Model-Generierung ⭐

Das `generate_models.py` Script generiert dbt Models automatisch aus `mds_meta`:

```bash
cd masterdata/dbt

# Environment Variables setzen
export MDS_DB_USER=sqladmin
export MDS_DB_PASSWORD='<password>'

# Alle Models generieren (Load + Master + Views)
python3 scripts/generate_models.py

# Spezifische Entity generieren
python3 scripts/generate_models.py --entity country

# Dry-Run (zeigt was generiert würde)
python3 scripts/generate_models.py --entity country --dry-run

# Nur Load-Models
python3 scripts/generate_models.py --loads-only

# Nur Master-Models (keine Views, keine Loads)
python3 scripts/generate_models.py --masters-only

# Nur Views
python3 scripts/generate_models.py --views-only
```

**Was wird generiert:**
- `models/mds_load/load_<entity>.sql` - Load-Tabelle (JSON → flach)
- `models/mds_master/mds_<entity>.sql` - SCD2 Master-Tabelle
- `models/mds_view/<view_code>.sql` - Views (aus `mds_meta.entity_view`)

**Quellen für Generierung:**
- `mds_meta.entity` - Entity-Definition (code, name, status)
- `mds_meta.attribute` - Spalten (code, data_type, is_business_key)
- `mds_meta.entity_view` - View-Definitionen (code, column_config, filter)

### Load Model ausführen ⭐

Lädt JSON aus `staged_record` in flache Tabelle `mds_load.<entity>`:

```bash
# Einzelne Entity laden
dbt run --select load_country --target local

# Alle Load-Models
dbt run --select mds_load --target local
```

**Status-Änderungen durch post_hook:**
- `staged_record.status`: 'committed' → 'loaded'
- `commit.status`: 'approved' → 'loaded'

### Master Model ausführen

Führt SCD2-Transformation von `mds_load` → `mds_master` aus:

```bash
# Einzelne Entity
dbt run --select mds_country --target local

# Full Refresh (Tabelle neu erstellen)
dbt run --select mds_country --target local --full-refresh

# Alle Master-Models
dbt run --select mds_master --target local
```

**Status-Änderungen durch post_hook:**
- `mds_load.is_processed`: 0 → 1
- `commit.status`: 'loaded' → 'deployed'

### Views ausführen

```bash
# Einzelne View
dbt run --select v_country --target local

# Alle Views
dbt run --select mds_view --target local
```

### Kompletter Deploy-Workflow

```bash
# 1. Models generieren (liest aus mds_meta)
python3 scripts/generate_models.py --entity country

# 2. Load: JSON → flache Tabelle (mds_load)
dbt run --select load_country --target local
# → staged_record.status = 'loaded'
# → commit.status = 'loaded'

# 3. Master: SCD2-Tabelle erstellen/aktualisieren (mds_master)
dbt run --select mds_country --target local
# → mds_load.is_processed = 1
# → commit.status = 'deployed'

# 4. Views erstellen (optional)
dbt run --select v_country --target local
```

**Automatisierter Kurzbefehl:**
```bash
# Alle 3 Schritte für eine Entity
dbt run --select load_country mds_country v_country --target local
```

### Worker-Aufrufe (BullMQ)

Der Worker ruft dbt über das `run-dbt.sh` Script:

```bash
# Bootstrap
./run-dbt.sh bootstrap

# Entity deployen (generiert Model + dbt run)
./run-dbt.sh deploy country

# Alle Master-Models
./run-dbt.sh run-master

# Alle Views
./run-dbt.sh run-views
```

## SCD Type 2 Implementierung

### Konzept

Das Customer-Model implementiert SCD Type 2 mit:
- **Soft Deletes**: Gelöschte Records werden als `is_deleted=1` markiert
- **Historisierung**: Jede Änderung erzeugt einen neuen Record
- **Current Flag**: `is_current=1` markiert den aktuellen Stand

### Datenfluss

```
1. UI Stage: Records erstellen (status='staged')   → mds_stage.staged_record
2. UI Commit: Records committen (status='committed')
3. UI Approve: Commit genehmigen                   → commit.status = 'approved'
4. dbt load_<entity>: JSON → mds_load             → staged_record.status = 'loaded'
                                                   → commit.status = 'loaded'
5. dbt mds_<entity>: mds_load → mds_master (SCD2) → mds_load.is_processed = 1
                                                   → commit.status = 'deployed'
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

## Neue Entity hinzufügen (Automatisch)

Mit der dynamischen Model-Generierung sind keine manuellen SQL-Dateien mehr nötig!

### Schritt 1: Entity in UI/API erstellen

```
UI: Models → Entity erstellen → Attribute definieren
```

Oder per SQL:
```sql
-- Entity erstellen
INSERT INTO mds_meta.entity (model_id, code, name, target_table, business_key_columns, status)
VALUES (1, 'product', 'Products', 'product', 'product_code', 'active');

-- Attribute erstellen
INSERT INTO mds_meta.attribute (entity_id, code, name, data_type, is_business_key, sort_order)
VALUES 
    (@entity_id, 'product_code', 'Product Code', 'string', 1, 1),
    (@entity_id, 'product_name', 'Product Name', 'string', 0, 2),
    (@entity_id, 'price', 'Price', 'decimal', 0, 3);
```

### Schritt 2: Daten stagen, committen und genehmigen

```
UI: Records hinzufügen → Commit erstellen → Commit genehmigen
```

Status-Flow: `staged` → `committed` → Commit `approved`

### Schritt 3: dbt Models generieren und ausführen

```bash
# Models generieren (liest Entity + Attribute aus mds_meta)
python3 scripts/generate_models.py --entity product

# Load: JSON → flache Tabelle
dbt run --select load_product --target local

# Master-Tabelle erstellen (SCD2)
dbt run --select mds_product --target local

# Optional: View erstellen (falls in entity_view definiert)
dbt run --select v_product --target local
```

### Schritt 4 (Optional): View definieren

```sql
INSERT INTO mds_meta.entity_view (entity_id, code, name, view_type, column_config, is_active)
VALUES (
    @entity_id, 
    'v_product', 
    'Product View', 
    'standard',
    '[{"code":"product_code","alias":"Code"},{"code":"product_name","alias":"Name"},{"code":"price","alias":"Price"}]',
    1
);
```

Dann erneut generieren:
```bash
python3 scripts/generate_models.py --entity product --views-only
dbt run --select v_product --target local
```

## Generierte Model-Templates

### Master Model (SCD2)

Generiertes `models/mds_master/mds_<entity>.sql`:

```sql
{{
  config(
    materialized='incremental',
    schema='mds_master',
    alias='<entity>',
    incremental_strategy='append',
    as_columnstore=false,
    pre_hook=[...],   -- Close current records
    post_hook=[...]   -- Mark processed
  )
}}

{% if is_incremental() %}
-- Incremental: Change Detection + Insert new versions
{% else %}
-- Full Refresh: Load all records
{% endif %}
```

### View Model

Generiertes `models/mds_view/<view_code>.sql`:

```sql
{{
  config(
    materialized='view',
    schema='mds_view',
    alias='<view_code>'
  )
}}

SELECT
    <column> AS [<alias>],
    ...
FROM mds_master.<entity>
WHERE is_current = 1
  AND is_deleted = 0
```

## Troubleshooting

### IDENTITY Column Error

```
Cannot insert explicit value for identity column in table 'country' when IDENTITY_INSERT is set to OFF
```

**Ursache**: Das dbt-Model versucht eine `id`-Spalte zu schreiben, aber die Tabelle hat `IDENTITY(1,1)`.

**Lösung**: Im Load-Model **keine `id`-Spalte** definieren. Stattdessen `source_id` für Referenzen verwenden:
```sql
-- FALSCH:
SELECT sr.id, ...  -- Versucht in IDENTITY zu schreiben!

-- RICHTIG:
SELECT CAST(sr.id AS NVARCHAR(255)) AS source_id, ...  -- Neue Spalte
```

### COLUMNSTORE Error

```
'COLUMNSTORE' is not supported in this service tier
```

**Lösung**: `as_columnstore: false` ist bereits im Generator-Template gesetzt.

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

### Model-Generator Connection Error

```
MDS_DB_PASSWORD environment variable is required
```

**Lösung**: Environment Variables setzen:
```bash
export MDS_DB_USER=sqladmin
export MDS_DB_PASSWORD='<password>'
```

### dbt Model nicht gefunden

```
Did not find any models named 'mds_product'
```

**Lösung**: Model zuerst generieren:
```bash
python3 scripts/generate_models.py --entity product
```

### View zeigt keine Daten

**Ursache**: Master-Tabelle existiert noch nicht oder hat keine Daten.

**Lösung**:
```bash
# 1. Master-Model ausführen
dbt run --select mds_<entity> --target local

# 2. Prüfen ob Daten in mds_load vorhanden
SELECT COUNT(*) FROM mds_load.<entity> WHERE is_processed = 0;
```

### Bootstrap schlägt fehl

Falls der Bootstrap nicht funktioniert:

```bash
# Manuell ausführen
cd masterdata/dbt
export MDS_DB_USER=sqladmin && export MDS_DB_PASSWORD='<password>'
dbt run-operation bootstrap_mds --target local
```

## Performance-Tipps

1. **Batch-Verarbeitung**: Mehrere Records pro Commit/Deploy
2. **Indices**: Automatisch auf `business_key` und `is_processed` 
3. **Incremental Strategy**: `append` ist schneller als `merge`
4. **Full Refresh**: Nur bei Schema-Änderungen nötig

## Quick Reference

### Kompletter Workflow (neue Entity)

```bash
# 1. Entity in UI erstellen (oder per SQL in mds_meta)

# 2. Daten stagen, committen, genehmigen (UI)

# 3. dbt Models generieren
export MDS_DB_USER=sqladmin && export MDS_DB_PASSWORD='<password>'
cd masterdata/dbt
python3 scripts/generate_models.py --entity <entity_code>

# 4. Load + Master + Views ausführen
dbt run --select load_<entity_code> --target local    # JSON → mds_load
dbt run --select mds_<entity_code> --target local     # mds_load → mds_master (SCD2)
dbt run --select mds_view --target local              # Falls Views definiert
```

### Häufige Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `python3 scripts/generate_models.py` | Alle Models generieren |
| `python3 scripts/generate_models.py --entity X` | Model für Entity X |
| `python3 scripts/generate_models.py --dry-run` | Zeigt was generiert würde |
| `python3 scripts/generate_models.py --loads-only` | Nur Load-Models |
| `python3 scripts/generate_models.py --masters-only` | Nur Master-Models |
| `dbt run --select mds_load` | Alle Load-Tabellen (JSON → flach) |
| `dbt run --select load_X` | Spezifische Load-Entity |
| `dbt run --select mds_master` | Alle Master-Tabellen (SCD2) |
| `dbt run --select mds_X` | Spezifische Master-Entity |
| `dbt run --select mds_view` | Alle Views |
| `dbt run --full-refresh` | Tabellen neu erstellen |
| `dbt run-operation bootstrap_mds` | MDS-Schemas initialisieren |

## Referenzen

- [dbt Documentation](https://docs.getdbt.com/)
- [dbt-sqlserver Adapter](https://github.com/dbt-msft/dbt-sqlserver)
- [SCD Type 2 Pattern](https://en.wikipedia.org/wiki/Slowly_changing_dimension#Type_2:_add_new_row)
