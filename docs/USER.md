# Data Vault 2.1 - Benutzer-Dokumentation

> **Projekt:** Virtual Data Vault 2.1 auf Azure  
> **Version:** 1.0.0  
> **Stand:** 2025-12-27

---

## 1. Erste Schritte

### 1.1 Voraussetzungen

- Linux VM mit Netzwerkzugang zu Azure SQL
- Python 3.10+ mit venv
- Azure CLI (`az`) installiert und eingeloggt
- SSH-Zugang zur VM (10.0.0.25)

### 1.2 Projekt Setup

```bash
# Zur VM verbinden
ssh user@10.0.0.25

# Projektverzeichnis
cd ~/projects/datavault-dbt

# Virtual Environment aktivieren
source .venv/bin/activate

# Azure CLI Login prüfen
az account show
```

### 1.3 dbt Verbindung testen

```bash
dbt debug
```

Erwartete Ausgabe:
```
  Connection:
    server: sql-datavault-weu-001.database.windows.net
    database: Vault
    schema: dv
    authentication: cli
  All checks passed!
```

---

## 2. Tägliche Operationen

### 2.1 Development (Shared Dev)

```bash
# Alle Models bauen (Target: dev → Vault DB)
dbt run

# Einzelnes Model bauen
dbt run --select stg_company_client
dbt run --select hub_company_client
dbt run --select sat_company_client

# Model mit allen Abhängigkeiten
dbt run --select +hub_company_client+

# Tests ausführen
dbt test

# SQL generieren ohne Ausführung
dbt compile
```

### 2.2 Produktion (Mandanten-spezifisch)

```bash
# Werkportal Produktion
dbt run --target werkportal

# EWB Produktion (wenn eingerichtet)
dbt run --target ewb
```

### 2.3 External Tables aktualisieren

```bash
# Development
dbt run-operation stage_external_sources

# Produktion
dbt run-operation stage_external_sources --target werkportal
```

---

## 3. Verfügbare Targets

| Target | Datenbank | Befehl |
|--------|-----------|--------|
| `dev` (Standard) | Vault | `dbt run` |
| `werkportal` | Vault_Werkportal | `dbt run --target werkportal` |
| `ewb` | Vault_EWB | `dbt run --target ewb` |

---

## 4. Neue Entity hinzufügen

### Schritt 1: External Table definieren

Bearbeite `models/staging/sources.yml`:

```yaml
- name: ext_neue_entity
  external:
    location: "werkportal/postgres/public.wp_neue_entity.parquet"
    file_format: ParquetFormat
  columns:
    - name: id
      data_type: BIGINT
    - name: name
      data_type: NVARCHAR(255)
    # ... weitere Spalten
```

### Schritt 2: Staging View erstellen

Erstelle `models/staging/stg_neue_entity.sql`:

```sql
{{- config(
    materialized='view'
) -}}

{%- set yaml_metadata -%}
source_model:
    werkportal_data: 'ext_neue_entity'
derived_columns:
    dss_record_source: "!werkportal.wp_neue_entity"
    dss_load_date: "GETDATE()"
hashed_columns:
    hk_neue_entity: 'id'
    hd_neue_entity:
        is_hashdiff: true
        columns:
            - name
            - description
{%- endset -%}

{% set metadata = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(
    include_source_columns=true,
    source_model=metadata['source_model'],
    derived_columns=metadata['derived_columns'],
    hashed_columns=metadata['hashed_columns']
) }}
```

### Schritt 3: Hub erstellen

Erstelle `models/raw_vault/hubs/hub_neue_entity.sql`:

```sql
{{- config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false
) -}}

{%- set source_model = "stg_neue_entity" -%}
{%- set src_pk = "hk_neue_entity" -%}
{%- set src_nk = "id" -%}
{%- set src_ldts = "dss_load_date" -%}
{%- set src_source = "dss_record_source" -%}

{{ automate_dv.hub(
    src_pk=src_pk, 
    src_nk=src_nk, 
    src_ldts=src_ldts, 
    src_source=src_source, 
    source_model=source_model
) }}
```

### Schritt 4: Satellite erstellen

Erstelle `models/raw_vault/satellites/sat_neue_entity.sql`:

```sql
{{- config(
    materialized='incremental',
    incremental_strategy='append',
    as_columnstore=false
) -}}

{%- set source_model = "stg_neue_entity" -%}
{%- set src_pk = "hk_neue_entity" -%}
{%- set src_hashdiff = "hd_neue_entity" -%}
{%- set src_ldts = "dss_load_date" -%}
{%- set src_source = "dss_record_source" -%}
{%- set src_payload = ["name", "description"] -%}

{{ automate_dv.sat(
    src_pk=src_pk, 
    src_hashdiff=src_hashdiff,
    src_payload=src_payload,
    src_ldts=src_ldts, 
    src_source=src_source, 
    source_model=source_model
) }}
```

### Schritt 5: Deployment

```bash
# External Table erstellen
dbt run-operation stage_external_sources

# Models bauen (Development)
dbt run --select stg_neue_entity hub_neue_entity sat_neue_entity

# Produktion
dbt run-operation stage_external_sources --target werkportal
dbt run --select stg_neue_entity hub_neue_entity sat_neue_entity --target werkportal
```

---

## 5. Useful dbt Commands

### 5.1 Basis-Befehle

| Befehl | Beschreibung |
|--------|--------------|
| `dbt debug` | Verbindung testen |
| `dbt deps` | Packages installieren/updaten |
| `dbt compile` | SQL generieren ohne Ausführung |
| `dbt run` | Alle Models bauen |
| `dbt test` | Tests ausführen |
| `dbt docs generate` | Dokumentation generieren |
| `dbt docs serve` | Dokumentation im Browser anzeigen |

### 5.2 Selektion

| Befehl | Beschreibung |
|--------|--------------|
| `dbt run --select model_name` | Einzelnes Model |
| `dbt run --select +model_name` | Model + Upstream |
| `dbt run --select model_name+` | Model + Downstream |
| `dbt run --select +model_name+` | Alles |
| `dbt run --select staging.*` | Alle Staging Models |
| `dbt run --select tag:hub` | Models mit Tag |

### 5.3 Full Refresh

```bash
# Inkrementelle Models neu bauen (DROP + CREATE)
dbt run --full-refresh
dbt run --full-refresh --select hub_company_client
```

---

## 6. Troubleshooting

### 6.1 Verbindungsprobleme

**Symptom:** `Login failed`
```bash
# Azure CLI Token erneuern
az login
az account set --subscription "<subscription-id>"
dbt debug
```

**Symptom:** `Connection timeout`
```bash
# Firewall prüfen
az sql server firewall-rule list \
  --resource-group synapse-playground \
  --server sql-datavault-weu-001
```

### 6.2 External Table Fehler

**Symptom:** `External table error`
```bash
# External Tables neu erstellen
dbt run-operation stage_external_sources

# Prüfen ob Parquet-Dateien existieren
# (Im Azure Portal: Storage Account → Containers → stage-fs)
```

### 6.3 Model-Fehler

**Symptom:** Kompilierungsfehler
```bash
# SQL anzeigen
dbt compile --select problem_model

# Generiertes SQL prüfen
cat target/compiled/datavault/models/path/to/model.sql
```

**Symptom:** `Columnstore not supported`
```yaml
# In dbt_project.yml oder Model-Config
+as_columnstore: false
```

### 6.4 Logs prüfen

```bash
# dbt Logs
less logs/dbt.log

# Letzte Queries
cat logs/query_log.sql

# Run Results
cat target/run_results.json | jq '.results[] | {model: .unique_id, status: .status}'
```

---

## 7. Daten prüfen

### 7.1 Azure SQL Query

```bash
# Via Azure CLI
az sql query \
  --server sql-datavault-weu-001 \
  --database Vault \
  --query "SELECT TOP 10 * FROM vault.hub_company_client"
```

### 7.2 Datenzählung

```sql
-- External Tables
SELECT COUNT(*) FROM stg.ext_company_client;
SELECT COUNT(*) FROM stg.ext_company_contractor;
SELECT COUNT(*) FROM stg.ext_company_supplier;
SELECT COUNT(*) FROM stg.ext_countries;

-- Data Vault
SELECT COUNT(*) FROM vault.hub_company_client;
SELECT COUNT(*) FROM vault.sat_company_client;
```

---

## 8. Best Practices

### 8.1 Development Workflow

1. **Entwickeln** auf `dev` Target
2. **Testen** mit `dbt test`
3. **Review** der generierten SQL in `target/compiled/`
4. **Commit** nach Git
5. **Deploy** auf Produktion mit `--target werkportal`

### 8.2 Naming Conventions

| Objekt | Pattern | Beispiel |
|--------|---------|----------|
| External Table | `ext_<entity>` | `ext_company_client` |
| Staging View | `stg_<entity>` | `stg_company_client` |
| Hub | `hub_<entity>` | `hub_company_client` |
| Satellite | `sat_<entity>` | `sat_company_client` |
| Link | `link_<e1>_<e2>` | `link_company_country` |
| Hash Key | `hk_<entity>` | `hk_company_client` |
| Hash Diff | `hd_<entity>` | `hd_company_client` |

### 8.3 Änderungen nachvollziehen

```bash
# Letzte Änderungen
git log --oneline -10

# Diff zu letztem Commit
git diff

# Model-History in Vault
SELECT * FROM vault.sat_company_client 
WHERE hk_company_client = '<hash>'
ORDER BY dss_load_date DESC;
```

---

## 9. Kontakt & Support

- **Repository:** `/home/user/projects/datavault-dbt`
- **VM:** 10.0.0.25
- **Azure SQL:** sql-datavault-weu-001.database.windows.net
- **Dokumentation:** `docs/SYSTEM.md`, `docs/USER.md`
- **Lessons Learned:** `LESSONS_LEARNED.md`

---

## 10. Changelog

| Datum | Änderung |
|-------|----------|
| 2025-12-27 | Initial Release |
