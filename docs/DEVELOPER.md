# Data Vault 2.1 - Developer Guide

> **Projekt:** Virtual Data Vault 2.1 auf Azure  
> **Version:** 2.0.0  
> **Stand:** 2025-12-27  
> **Zielgruppe:** Entwickler, Data Engineers

---

## 📑 Inhaltsverzeichnis

1. [Quick Reference](#-quick-reference)
2. [Projektstruktur](#-projektstruktur)
3. [Neues Attribut hinzufügen](#-neues-attribut-hinzufügen)
4. [Neue Entity erstellen (Komplett)](#-neue-entity-erstellen-komplett)
5. [Einzelne Objekte erstellen](#-einzelne-objekte-erstellen)
   - [Hub erstellen](#51-hub-erstellen)
   - [Satellite erstellen](#52-satellite-erstellen)
   - [Link erstellen](#53-link-erstellen)
   - [Reference Table erstellen](#54-reference-table-erstellen)
   - [Effectivity Satellite erstellen](#55-effectivity-satellite-erstellen)
   - [PIT Table erstellen](#56-pit-table-erstellen)
6. [Mart View erstellen](#-mart-view-erstellen)
7. [Tests hinzufügen](#-tests-hinzufügen)
8. [Deployment Workflow](#-deployment-workflow)
9. [Troubleshooting](#-troubleshooting)
10. [Checklisten](#-checklisten)

---

## 🚀 Quick Reference

### Häufigste Befehle

```bash
# Umgebung aktivieren
cd ~/projects/datavault-dbt && source .venv/bin/activate

# Verbindung testen
dbt debug

# Models bauen
dbt run                              # Alle Models
dbt run --select hub_company         # Einzelnes Model
dbt run --select +sat_company+       # Model mit Abhängigkeiten
dbt run --full-refresh               # Alles neu bauen

# External Tables aktualisieren
dbt run-operation stage_external_sources

# Tests
dbt test                             # Alle Tests
dbt test --select hub_company        # Tests für ein Model

# Seeds (Reference Data)
dbt seed                             # Alle Seeds laden

# Kompilieren (SQL anzeigen ohne Ausführung)
dbt compile --select model_name
cat target/compiled/datavault/models/path/to/model.sql
```

### Wichtige Dateien

| Datei | Zweck | Link |
|-------|-------|------|
| `dbt_project.yml` | Projektkonfiguration | [öffnen](../dbt_project.yml) |
| `models/staging/sources.yml` | External Tables Definition | [öffnen](../models/staging/sources.yml) |
| `models/schema.yml` | Tests & Dokumentation | [öffnen](../models/schema.yml) |
| `macros/generate_schema_name.sql` | Schema-Naming | [öffnen](../macros/generate_schema_name.sql) |
| `macros/satellite_current_flag.sql` | Current Flag Macro | [öffnen](../macros/satellite_current_flag.sql) |
| `macros/ghost_records.sql` | Ghost Records | [öffnen](../macros/ghost_records.sql) |

---

## 📁 Projektstruktur

```
datavault-dbt/
├── dbt_project.yml              # ⚙️ Projektkonfiguration
├── packages.yml                 # 📦 Package-Abhängigkeiten
├── profiles.yml                 # 🔐 In ~/.dbt/ (nicht im Repo!)
│
├── macros/                      # 🔧 Wiederverwendbare Macros
│   ├── generate_schema_name.sql
│   ├── satellite_current_flag.sql
│   └── ghost_records.sql
│
├── seeds/                       # 🌱 Reference Data (CSV)
│   └── ref_role.csv
│
├── models/
│   ├── schema.yml              # 📋 Tests & Dokumentation
│   │
│   ├── staging/                # 📥 Staging Layer
│   │   ├── sources.yml         #    External Table Definitionen
│   │   ├── stg_company.sql     #    Staging View
│   │   └── stg_country.sql
│   │
│   ├── raw_vault/              # 🏛️ Raw Vault Layer
│   │   ├── hubs/
│   │   │   ├── hub_company.sql
│   │   │   └── hub_country.sql
│   │   ├── satellites/
│   │   │   ├── sat_company.sql
│   │   │   ├── sat_country.sql
│   │   │   ├── sat_company_client_ext.sql
│   │   │   └── eff_sat_company_country.sql
│   │   └── links/
│   │       ├── link_company_role.sql
│   │       └── link_company_country.sql
│   │
│   ├── business_vault/         # 📊 Business Vault Layer
│   │   └── pit_company.sql
│   │
│   └── mart/                   # 📈 Mart Layer (für BI)
│       └── (Views für Reporting)
│
├── docs/                       # 📚 Dokumentation
│   ├── SYSTEM.md
│   ├── USER.md
│   ├── DEVELOPER.md            # ← Diese Datei
│   └── MODEL_ARCHITECTURE.md
│
└── target/                     # 🎯 Kompilierte Artefakte
    └── compiled/               #    Generiertes SQL
```

---

## ➕ Neues Attribut hinzufügen

### Szenario
Ein bestehendes Attribut soll zum Satellite hinzugefügt werden (z.B. `tax_number` zu `sat_company`).

### Schritt-für-Schritt

#### Schritt 1: External Table erweitern

📄 **Datei:** [models/staging/sources.yml](../models/staging/sources.yml)

```yaml
# Finde die External Table und füge die Spalte hinzu
- name: ext_company_client
  columns:
    # ... bestehende Spalten ...
    - name: tax_number          # ← NEU
      data_type: NVARCHAR(50)   # ← Datentyp
```

#### Schritt 2: Staging View erweitern

📄 **Datei:** [models/staging/stg_company.sql](../models/staging/stg_company.sql)

```sql
-- 1. Füge Spalte zur SELECT-Liste hinzu
client_source AS (
    SELECT 
        object_id,
        -- ... bestehende Spalten ...
        tax_number,              -- ← NEU
        -- ...
    FROM {{ source('staging', 'ext_company_client') }}
),

-- 2. Falls im Hash Diff: Füge zur hashdiff_columns Liste hinzu
{%- set hashdiff_columns = [
    'name',
    'street',
    -- ... bestehende ...
    'tax_number'                 -- ← NEU (falls Änderungen getrackt werden sollen)
] -%}
```

#### Schritt 3: Satellite erweitern

📄 **Datei:** [models/raw_vault/satellites/sat_company.sql](../models/raw_vault/satellites/sat_company.sql)

```sql
WITH source_data AS (
    SELECT 
        hk_company,
        hd_company,
        -- ... bestehende Spalten ...
        tax_number,              -- ← NEU
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_company') }}
    WHERE hk_company IS NOT NULL
),
-- ... Rest bleibt gleich ...
```

#### Schritt 4: Deployment

```bash
# External Table aktualisieren
dbt run-operation stage_external_sources

# Satellite neu bauen (full-refresh wegen Schemaänderung!)
dbt run --full-refresh --select stg_company sat_company

# Tests ausführen
dbt test --select sat_company
```

### ⚠️ Wichtig
- Bei **Schema-Änderungen** immer `--full-refresh` verwenden
- Hash Diff nur erweitern wenn Änderungen getrackt werden sollen
- Nach Änderung: Tests ausführen!

---

## 🏗️ Neue Entity erstellen (Komplett)

### Szenario
Eine komplett neue Entity soll ins Data Vault (z.B. `product` aus einer neuen Quelltabelle).

### Übersicht der Schritte

```
┌──────────────────────────────────────────────────────────────────┐
│  1. External Table    →  2. Staging View  →  3. Hub             │
│        ↓                                          ↓              │
│  sources.yml               stg_product.sql      hub_product.sql │
│                                   ↓                    ↓         │
│                            4. Satellite         5. Link          │
│                            sat_product.sql      link_*.sql       │
│                                   ↓                              │
│                            6. Tests & Deploy                     │
└──────────────────────────────────────────────────────────────────┘
```

### Schritt 1: External Table definieren

📄 **Datei:** [models/staging/sources.yml](../models/staging/sources.yml)

```yaml
sources:
  - name: staging
    database: "{{ target.database }}"
    schema: stg
    tables:
      # ... bestehende Tabellen ...
      
      # ═══════════════════════════════════════════
      # NEU: Product
      # ═══════════════════════════════════════════
      - name: ext_product
        external:
          location: "werkportal/postgres/public.wp_product.parquet"
          file_format: ParquetFormat
        columns:
          - name: object_id
            data_type: BIGINT
            tests:
              - not_null
          - name: name
            data_type: NVARCHAR(255)
          - name: description
            data_type: NVARCHAR(MAX)
          - name: price
            data_type: DECIMAL(18,2)
          - name: category_id
            data_type: BIGINT
          - name: dss_record_source
            data_type: NVARCHAR(100)
          - name: dss_load_date
            data_type: DATETIME2
          - name: dss_run_id
            data_type: NVARCHAR(100)
```

### Schritt 2: Staging View erstellen

📄 **Neue Datei:** `models/staging/stg_product.sql`

```sql
/*
 * Staging Model: stg_product
 * 
 * Bereitet Product-Daten für das Data Vault vor.
 * Hash Key Separator: '^^' (DV 2.1 Standard)
 */

{%- set hashdiff_columns = [
    'name',
    'description',
    'price',
    'category_id'
] -%}

WITH source AS (
    SELECT * FROM {{ source('staging', 'ext_product') }}
),

staged AS (
    SELECT
        -- ===========================================
        -- HASH KEYS
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(object_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_product,
        
        -- FK zu anderen Hubs (falls vorhanden)
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            ISNULL(CAST(category_id AS NVARCHAR(MAX)), '')
        ), 2) AS hk_category,
        
        -- ===========================================
        -- HASH DIFF (Change Detection)
        -- ===========================================
        CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
            CONCAT(
                {%- for col in hashdiff_columns %}
                ISNULL(CAST({{ col }} AS NVARCHAR(MAX)), ''){{ ',' if not loop.last else '' }}
                {%- endfor %}
            )
        ), 2) AS hd_product,
        
        -- ===========================================
        -- BUSINESS KEY
        -- ===========================================
        object_id,
        
        -- ===========================================
        -- PAYLOAD
        -- ===========================================
        name,
        description,
        price,
        category_id,
        
        -- ===========================================
        -- METADATA
        -- ===========================================
        COALESCE(dss_record_source, 'werkportal') AS dss_record_source,
        COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE()) AS dss_load_date,
        dss_run_id
        
    FROM source
)

SELECT * FROM staged
```

### Schritt 3: Hub erstellen

📄 **Neue Datei:** `models/raw_vault/hubs/hub_product.sql`

```sql
/*
 * Hub: hub_product
 * Schema: vault
 * 
 * Speichert eindeutige Product Business Keys.
 * Insert-Only: Neue Products werden hinzugefügt, nie gelöscht.
 */

{{ config(
    materialized='incremental',
    unique_key='hk_product',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT DISTINCT
        hk_product,
        object_id,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_product') }}
    WHERE hk_product IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_product FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_product,
        src.object_id,
        src.dss_load_date,
        src.dss_record_source
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_product = src.hk_product
    )
    {% endif %}
)

SELECT * FROM new_records
```

### Schritt 4: Satellite erstellen

📄 **Neue Datei:** `models/raw_vault/satellites/sat_product.sql`

```sql
/*
 * Satellite: sat_product
 * Schema: vault
 * 
 * Speichert Product-Attribute mit vollständiger Historie.
 * dss_is_current: 'Y' für aktuellen Eintrag
 * dss_end_date: Ende der Gültigkeit
 */

{{ config(
    materialized='incremental',
    unique_key='hk_product',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, 'hk_product') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_product,
        hd_product,
        dss_load_date,
        dss_record_source,
        -- Payload
        name,
        description,
        price,
        category_id
    FROM {{ ref('stg_product') }}
    WHERE hk_product IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT 
        hk_product,
        hd_product
    FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT
        src.hk_product,
        src.hd_product,
        src.dss_load_date,
        src.dss_record_source,
        src.name,
        src.description,
        src.price,
        src.category_id
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_product = src.hk_product
          AND es.hd_product = src.hd_product
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
```

### Schritt 5: Tests hinzufügen

📄 **Datei:** [models/schema.yml](../models/schema.yml)

```yaml
models:
  # ... bestehende Models ...
  
  # ═══════════════════════════════════════════
  # Product
  # ═══════════════════════════════════════════
  - name: stg_product
    columns:
      - name: hk_product
        tests:
          - not_null
      - name: object_id
        tests:
          - not_null

  - name: hub_product
    columns:
      - name: hk_product
        tests:
          - unique
          - not_null
      - name: object_id
        tests:
          - not_null
      - name: dss_load_date
        tests:
          - not_null
      - name: dss_record_source
        tests:
          - not_null

  - name: sat_product
    columns:
      - name: hk_product
        tests:
          - not_null
          - relationships:
              to: ref('hub_product')
              field: hk_product
      - name: hd_product
        tests:
          - not_null
```

### Schritt 6: Deployment

```bash
# 1. External Table erstellen
dbt run-operation stage_external_sources

# 2. Alle neuen Models bauen
dbt run --select stg_product hub_product sat_product

# 3. Tests ausführen
dbt test --select stg_product hub_product sat_product

# 4. Ghost Records hinzufügen (optional)
# → Macro in ghost_records.sql erweitern
```

---

## 🔨 Einzelne Objekte erstellen

### 5.1 Hub erstellen

📄 **Vorlage:** [models/raw_vault/hubs/hub_company.sql](../models/raw_vault/hubs/hub_company.sql)

**Minimales Template:**

```sql
{{ config(
    materialized='incremental',
    unique_key='hk_<entity>',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT DISTINCT
        hk_<entity>,
        <business_key_columns>,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_<entity>') }}
    WHERE hk_<entity> IS NOT NULL
),

{% if is_incremental() %}
existing_hubs AS (
    SELECT hk_<entity> FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT *
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_hubs eh
        WHERE eh.hk_<entity> = src.hk_<entity>
    )
    {% endif %}
)

SELECT * FROM new_records
```

**Ersetzen:**
- `<entity>` → Name der Entity (z.B. `product`)
- `<business_key_columns>` → Spalten des Business Keys

---

### 5.2 Satellite erstellen

📄 **Vorlage:** [models/raw_vault/satellites/sat_company.sql](../models/raw_vault/satellites/sat_company.sql)

**Minimales Template:**

```sql
{{ config(
    materialized='incremental',
    unique_key='hk_<entity>',
    as_columnstore=false,
    post_hook=[
        "{{ update_satellite_current_flag(this, 'hk_<entity>') }}"
    ]
) }}

WITH source_data AS (
    SELECT 
        hk_<entity>,
        hd_<entity>,
        dss_load_date,
        dss_record_source,
        -- Payload Spalten hier
        <payload_columns>
    FROM {{ ref('stg_<entity>') }}
    WHERE hk_<entity> IS NOT NULL
),

{% if is_incremental() %}
existing_sats AS (
    SELECT hk_<entity>, hd_<entity> FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT *
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_sats es
        WHERE es.hk_<entity> = src.hk_<entity>
          AND es.hd_<entity> = src.hd_<entity>
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_current,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
```

---

### 5.3 Link erstellen

📄 **Vorlage:** [models/raw_vault/links/link_company_role.sql](../models/raw_vault/links/link_company_role.sql)

**Minimales Template:**

```sql
{{ config(
    materialized='incremental',
    unique_key='hk_link_<entity1>_<entity2>',
    as_columnstore=false
) }}

WITH source_data AS (
    SELECT DISTINCT
        hk_link_<entity1>_<entity2>,
        hk_<entity1>,
        hk_<entity2>,
        dss_load_date,
        dss_record_source
    FROM {{ ref('stg_<source>') }}
    WHERE hk_<entity1> IS NOT NULL
      AND hk_<entity2> IS NOT NULL
),

{% if is_incremental() %}
existing_links AS (
    SELECT hk_link_<entity1>_<entity2> FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT *
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing_links el
        WHERE el.hk_link_<entity1>_<entity2> = src.hk_link_<entity1>_<entity2>
    )
    {% endif %}
)

SELECT * FROM new_records
```

**Wichtig:** Der Link Hash Key muss im Staging berechnet werden:

```sql
-- In stg_<source>.sql
CONVERT(CHAR(64), HASHBYTES('SHA2_256', 
    CONCAT(
        ISNULL(CAST(<entity1_bk> AS NVARCHAR(MAX)), ''),
        '^^',
        ISNULL(CAST(<entity2_bk> AS NVARCHAR(MAX)), '')
    )
), 2) AS hk_link_<entity1>_<entity2>
```

---

### 5.4 Reference Table erstellen

📄 **Vorlage:** [seeds/ref_role.csv](../seeds/ref_role.csv)

**Schritt 1:** CSV-Datei erstellen

```csv
role_code,role_name,role_description
CLIENT,Kunde,Unternehmen das Dienstleistungen bezieht
CONTRACTOR,Auftragnehmer,Unternehmen das Aufträge ausführt
SUPPLIER,Lieferant,Unternehmen das Waren liefert
```

📄 **Speichern als:** `seeds/ref_<name>.csv`

**Schritt 2:** Konfiguration in dbt_project.yml

📄 **Datei:** [dbt_project.yml](../dbt_project.yml)

```yaml
seeds:
  datavault:
    +schema: vault
    ref_<name>:
      +column_types:
        <column>: VARCHAR(50)
```

**Schritt 3:** Deployment

```bash
dbt seed --select ref_<name>
```

---

### 5.5 Effectivity Satellite erstellen

📄 **Vorlage:** [models/raw_vault/satellites/eff_sat_company_country.sql](../models/raw_vault/satellites/eff_sat_company_country.sql)

Für Links die **Gültigkeitszeiträume** haben (z.B. "Firma war von 2020-2023 in Deutschland").

```sql
{{ config(
    materialized='incremental',
    unique_key=['hk_<hub>', 'dss_start_date'],
    as_columnstore=false,
    post_hook=[
        "{{ update_effectivity_end_dates() }}"
    ]
) }}

WITH source_data AS (
    SELECT
        hk_<hub>,
        hk_<related_hub>,
        hk_link_<entity1>_<entity2>,
        dss_load_date AS dss_start_date,
        dss_record_source
    FROM {{ ref('stg_<source>') }}
),

{% if is_incremental() %}
existing AS (
    SELECT hk_<hub>, dss_start_date FROM {{ this }}
),
{% endif %}

new_records AS (
    SELECT *
    FROM source_data src
    {% if is_incremental() %}
    WHERE NOT EXISTS (
        SELECT 1 FROM existing e
        WHERE e.hk_<hub> = src.hk_<hub>
          AND e.dss_start_date = src.dss_start_date
    )
    {% endif %}
)

SELECT 
    *,
    'Y' AS dss_is_active,
    CAST(NULL AS DATETIME2) AS dss_end_date
FROM new_records
```

---

### 5.6 PIT Table erstellen

📄 **Vorlage:** [models/business_vault/pit_company.sql](../models/business_vault/pit_company.sql)

PIT (Point-in-Time) Tabellen für effiziente historische Abfragen.

```sql
{{ config(
    materialized='table',
    as_columnstore=false
) }}

WITH snapshot_dates AS (
    SELECT DISTINCT CAST(dss_load_date AS DATE) AS snapshot_date
    FROM {{ ref('sat_<entity>') }}
),

<entities> AS (
    SELECT DISTINCT hk_<entity>
    FROM {{ ref('hub_<entity>') }}
),

pit_base AS (
    SELECT 
        e.hk_<entity>,
        sd.snapshot_date
    FROM <entities> e
    CROSS JOIN snapshot_dates sd
),

sat_lookup AS (
    SELECT 
        pb.hk_<entity>,
        pb.snapshot_date,
        (
            SELECT TOP 1 s.hk_<entity>
            FROM {{ ref('sat_<entity>') }} s
            WHERE s.hk_<entity> = pb.hk_<entity>
              AND CAST(s.dss_load_date AS DATE) <= pb.snapshot_date
            ORDER BY s.dss_load_date DESC
        ) AS sat_<entity>_hk,
        (
            SELECT TOP 1 s.dss_load_date
            FROM {{ ref('sat_<entity>') }} s
            WHERE s.hk_<entity> = pb.hk_<entity>
              AND CAST(s.dss_load_date AS DATE) <= pb.snapshot_date
            ORDER BY s.dss_load_date DESC
        ) AS sat_<entity>_ldts
    FROM pit_base pb
)

SELECT * FROM sat_lookup
WHERE sat_<entity>_hk IS NOT NULL
```

---

## 📊 Mart View erstellen

### Szenario
Eine flache View für BI-Tools (Power BI, Excel) erstellen.

📄 **Neue Datei:** `models/mart/v_<name>.sql`

**Beispiel: Aktuelle Firmendaten**

```sql
/*
 * Mart View: v_company_current
 * Schema: mart_project
 * 
 * Flache View mit aktuellen Firmendaten für Reporting.
 */

{{ config(
    materialized='view'
) }}

SELECT
    -- IDs (für Joins)
    h.hk_company,
    h.object_id,
    h.source_table,
    
    -- Stammdaten
    s.name AS company_name,
    s.street,
    s.citycode AS zip_code,
    s.city,
    s.country AS country_id,
    co.name AS country_name,
    
    -- Kontakt
    s.email,
    s.phone,
    s.mobile,
    s.website,
    
    -- Finanzen
    s.iban,
    s.bic,
    s.credit_rating,
    
    -- Rolle
    lr.role_code,
    r.role_name,
    
    -- Metadata
    s.dss_load_date AS last_updated,
    s.dss_record_source AS source_system

FROM {{ ref('hub_company') }} h

-- Aktuelle Satellite-Daten
INNER JOIN {{ ref('sat_company') }} s 
    ON h.hk_company = s.hk_company 
    AND s.dss_is_current = 'Y'

-- Rolle
LEFT JOIN {{ ref('link_company_role') }} lr 
    ON h.hk_company = lr.hk_company
LEFT JOIN {{ ref('ref_role') }} r 
    ON lr.role_code = r.role_code

-- Land
LEFT JOIN {{ ref('link_company_country') }} lc 
    ON h.hk_company = lc.hk_company
LEFT JOIN {{ ref('sat_country') }} co 
    ON lc.hk_country = co.hk_country 
    AND co.dss_is_current = 'Y'

-- Ghost Records ausschließen
WHERE h.object_id > 0
```

**Konfiguration in dbt_project.yml:**

```yaml
models:
  datavault:
    mart:
      +schema: mart_project
      +materialized: view
```

**Deployment:**

```bash
dbt run --select v_company_current
```

---

## 🧪 Tests hinzufügen

### Test-Typen

| Test | Zweck | Beispiel |
|------|-------|----------|
| `not_null` | Spalte darf nicht NULL sein | Primary Keys, Business Keys |
| `unique` | Werte müssen eindeutig sein | Hash Keys in Hubs |
| `relationships` | FK-Beziehung validieren | Satellite → Hub |
| `accepted_values` | Nur bestimmte Werte erlaubt | Status-Felder |

### Tests in schema.yml

📄 **Datei:** [models/schema.yml](../models/schema.yml)

```yaml
models:
  - name: hub_<entity>
    columns:
      - name: hk_<entity>
        tests:
          - unique
          - not_null
      - name: <business_key>
        tests:
          - not_null

  - name: sat_<entity>
    columns:
      - name: hk_<entity>
        tests:
          - not_null
          - relationships:
              to: ref('hub_<entity>')
              field: hk_<entity>
      - name: hd_<entity>
        tests:
          - not_null
      - name: dss_is_current
        tests:
          - accepted_values:
              values: ['Y', 'N']
```

### Tests ausführen

```bash
# Alle Tests
dbt test

# Tests für bestimmtes Model
dbt test --select hub_company

# Tests für Tag
dbt test --select tag:hub
```

---

## 🚢 Deployment Workflow

### GitHub Actions CI/CD Pipeline

Das Projekt verwendet **GitHub Actions** für automatisiertes Deployment. Der Self-hosted Runner läuft auf der gleichen VM wie die Entwicklungsumgebung.

#### Verfügbare Workflows

| Workflow | Trigger | Zweck |
|----------|---------|-------|
| **CI** | PR nach main/dev | Validierung (compile + test) |
| **Deploy Dev** | Push auf main / manual | Deployment nach Vault (Dev) |
| **Deploy Prod** | Tag v* / manual + Approval | Deployment nach Vault_Werkportal |
| **Docs** | Push auf main / manual | dbt docs → GitHub Pages |

#### Workflow manuell ausführen

```bash
# Deploy Dev manuell triggern
gh workflow run deploy-dev.yml --ref main

# Deploy Prod manuell triggern (erfordert Approval!)
gh workflow run deploy-prod.yml --ref main -f target=werkportal

# Docs generieren
gh workflow run docs.yml --ref main
```

#### Workflow-Status prüfen

```bash
# Letzte Runs anzeigen
gh run list --limit 5

# Bestimmten Run beobachten
gh run watch <run-id>

# Logs eines fehlgeschlagenen Runs
gh run view <run-id> --log-failed
```

### Manuelles Deployment (Lokal)

Falls die Pipeline nicht verwendet werden soll:

```bash
# ╔═══════════════════════════════════════════════════════╗
# ║                    DEVELOPMENT                        ║
# ╚═══════════════════════════════════════════════════════╝

# 1. Änderungen entwickeln
dbt run --select <changed_models>

# 2. Tests lokal ausführen
dbt test --select <changed_models>

# 3. SQL prüfen
dbt compile --select <model>
cat target/compiled/datavault/models/path/to/model.sql

# 4. Git Commit & Push
git add .
git commit -m "feat: Add <feature>"
git push origin dev

# 5. Pull Request erstellen → CI läuft automatisch
gh pr create --base main --head dev --title "feat: <feature>"

# ╔═══════════════════════════════════════════════════════╗
# ║              PRODUCTION (via CI/CD)                   ║
# ╚═══════════════════════════════════════════════════════╝

# 6. PR mergen → Deploy Dev läuft automatisch
gh pr merge <pr-number> --squash

# 7. Für Prod: Tag erstellen oder manuell triggern
git tag v1.0.0 && git push origin v1.0.0
# ODER
gh workflow run deploy-prod.yml --ref main -f target=werkportal
# → Approval in GitHub erforderlich!
```

### Manuelles Prod-Deployment (ohne CI/CD)

```bash
# ╔═══════════════════════════════════════════════════════╗
# ║              PRODUCTION (manuell)                     ║
# ╚═══════════════════════════════════════════════════════╝

# 1. External Tables in Prod erstellen/aktualisieren
dbt run-operation stage_external_sources --target werkportal

# 2. Seeds laden (falls geändert)
dbt seed --target werkportal

# 3. Models deployen
dbt run --target werkportal

# 4. Tests in Prod
dbt test --target werkportal
```

### Full Refresh (Schema-Änderungen)

```bash
# Bei Spaltenänderungen: Full Refresh erforderlich!
dbt run --full-refresh --target werkportal
```

---

## 🔧 Troubleshooting

### Häufige Fehler

| Fehler | Ursache | Lösung |
|--------|---------|--------|
| `Column not found` | Spalte fehlt in External Table | `sources.yml` prüfen, `stage_external_sources` ausführen |
| `Columnstore not supported` | Azure SQL Basic Tier | `+as_columnstore: false` in Config |
| `Hash Diff changed unexpectedly` | Neue Spalte ohne Full Refresh | `dbt run --full-refresh` |
| `Duplicate key` | Unique-Constraint verletzt | Hash Key Berechnung prüfen |
| `Cross-database reference` | Hardcoded Database | `{{ target.database }}` verwenden |
| `Login timeout` | Azure Token abgelaufen | `az login` ausführen |

### Debug-Befehle

```bash
# Generiertes SQL anzeigen
dbt compile --select <model>
cat target/compiled/datavault/models/path/to/model.sql

# Logs prüfen
less logs/dbt.log

# Letzte Query
cat target/run/datavault/models/path/to/model.sql

# Verbindung testen
dbt debug
```

---

## ✅ Checklisten

### Neue Entity Checkliste

```
□ External Table in sources.yml definiert
□ Staging View erstellt (stg_<entity>.sql)
  □ Hash Key berechnet
  □ Hash Diff berechnet (falls Satellite)
  □ Metadata-Spalten gemappt
□ Hub erstellt (hub_<entity>.sql)
□ Satellite erstellt (sat_<entity>.sql)
  □ Post-Hook für dss_is_current
□ Link erstellt (falls Beziehung)
□ Tests in schema.yml hinzugefügt
□ dbt run-operation stage_external_sources
□ dbt run --select stg_* hub_* sat_*
□ dbt test
□ Ghost Records erweitert (optional)
□ Dokumentation aktualisiert
```

### Attribut hinzufügen Checkliste

```
□ Spalte in sources.yml hinzugefügt
□ Spalte in Staging View hinzugefügt
□ Spalte in Hash Diff (falls getrackt)
□ Spalte in Satellite hinzugefügt
□ dbt run-operation stage_external_sources
□ dbt run --full-refresh --select stg_* sat_*
□ dbt test
```

### Pre-Deployment Checkliste

```
□ Alle Tests lokal bestanden
□ SQL kompiliert und geprüft
□ Keine hardcoded Datenbanknamen
□ +as_columnstore: false gesetzt
□ Hash-Separator ist '^^'
□ Git committed und gepusht
□ PR erstellt und CI erfolgreich ✓
```

### CI/CD Troubleshooting

| Problem | Lösung |
|---------|--------|
| CI läuft nicht | Prüfen ob Änderungen in `models/`, `macros/`, etc. (Path Filter!) |
| Profile not found | `profile:` in dbt_project.yml muss mit profiles.yml übereinstimmen |
| Runner offline | `sudo systemctl restart actions.runner.fellnerd-datavault-dbt.dbt-runner-vm` |
| Prod-Tests fehlen | `dbt seed --target werkportal` ausführen |
| Azure Login failed | Service Principal Secret ggf. abgelaufen, neu generieren |

---

## 📚 Weiterführende Dokumentation

| Dokument | Inhalt | Link |
|----------|--------|------|
| System-Dokumentation | Architektur, Komponenten | [SYSTEM.md](SYSTEM.md) |
| User-Dokumentation | Endanwender-Guide | [USER.md](USER.md) |
| Model Architecture | Datenmodell, ERD | [MODEL_ARCHITECTURE.md](MODEL_ARCHITECTURE.md) |
| Lessons Learned | Entscheidungen, Troubleshooting | [LESSONS_LEARNED.md](../LESSONS_LEARNED.md) |
| Copilot Instructions | KI-Assistenz Regeln | [copilot-instructions.md](../.github/copilot-instructions.md) |
| **CI/CD Plan** | Pipeline-Implementierung | [plan-githubActionsCiCd.prompt.prompt.md](../.github/prompts/plan-githubActionsCiCd.prompt.prompt.md) |
| **dbt Docs** | Generierte Dokumentation | [fellnerd.github.io/datavault-dbt](https://fellnerd.github.io/datavault-dbt/) |
| **GitHub Actions** | Pipeline-Runs | [Actions](https://github.com/fellnerd/datavault-dbt/actions) |

---

*Letzte Aktualisierung: 2025-12-27*
