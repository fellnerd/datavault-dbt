# Create Data Vault Entity (Hub + Satellite)

Creates a complete Data Vault entity: External Table definition, Staging View, Hub, Satellite, Current View, Schema YAML, and ER Diagram update.

## When to Use

- Adding a new source table to the Data Vault
- Creating a new business object (Hub + Satellite)
- Onboarding a new entity from an existing or new source system

## Prerequisites

- Source table exists (External Table or LOAD table)
- Column definitions are known (names, types, nullable)
- Business Key columns are identified (Natural Keys preferred)
- Source system key is known (e.g., `sap_co`, `jira`, `sap_hcm`)
- Concept folder exists or needs creation in `models/raw_vault/<concept>/`

## Step-by-Step Workflow

### 1. Identify Business Keys and Attributes

Ask the user:
- What is the **source table** name and schema?
- What are the **Business Key columns**? (Natural Keys, must uniquely identify a record)
- What is the **source system key**? (e.g., `sap_co`, `jira`)
- What **concept** folder? (e.g., `sap_co`, `jira`, `adventureworks`)

Sort Business Keys **alphabetically** for all hash calculations and `dss_business_key`.

### 2. Add External Table to sources.yml

Add to `models/staging/sources.yml`:
```yaml
- name: ext_<concept>_<entity>
  external:
    location: "{{ var('<concept>_container') }}/<concept>/<entity>"
    file_format: parquet
  columns:
    - name: <COLUMN_NAME>
      data_type: <SQL_SERVER_TYPE>
      description: <description>
```

### 3. Create Staging View

File: `models/staging/<concept>_<entity>.sql`

Use `automate_dv.stage()` with:
- `derived_columns`: dss_record_source, dss_load_date, dss_create_datetime, dss_business_key
- `hashed_columns`: hk_<entity> (BK alphabetisch), hd_<entity> (alle non-BK Attribute alphabetisch)

See `templates/staging.sql` for the full template.

### 4. Create Hub

File: `models/raw_vault/<concept>/hubs/hub_<entity>.sql`

Use `automate_dv.hub()` with:
- `src_pk`: hk_<entity>
- `src_nk`: [BK1, BK2, ...] (alphabetisch)
- `src_extra_columns`: ['dss_business_key', 'dss_create_datetime']
- `source_model`: '<concept>_<entity>'

See `templates/hub.sql` for the full template.

### 5. Create Satellite

File: `models/raw_vault/<concept>/satellites/sat_<entity>__<system>.sql`

Use `automate_dv.sat()` with:
- `src_pk`: hk_<entity>
- `src_hashdiff`: { source_column: 'hd_<entity>', alias: 'HASHDIFF' }
- `src_payload`: [all non-BK columns]
- `src_extra_columns`: ['dss_create_datetime']

See `templates/satellite.sql` for the full template.

### 6. Create Current View

File: `models/raw_vault/<concept>/satellites/sat_<entity>__<system>_current_v.sql`

```sql
{{ config(materialized='view') }}
{{ satellite_current_view(
    satellite_ref=ref('sat_<entity>__<system>'),
    hashkey_column='hk_<entity>',
    hashdiff_column='HASHDIFF',
    ledts_column='dss_load_date'
) }}
```

### 7. Create Schema YAML

File: `models/raw_vault/<concept>/_<concept>__models.yml`

Document all models with column definitions, descriptions, and tests.

### 8. Update ER Diagram

File: `design/raw-vault/<concept>/er-diagram.mmd`

Add Hub and Satellite with all columns and relationship.

### 9. Update dbt_project.yml (if new concept)

Add under `models:raw_vault:`:
```yaml
<concept>:
  +schema: vault_<concept>
  +materialized: incremental
  +incremental_strategy: append
  +as_columnstore: false
```

### 10. Compile and Verify

```bash
dbt compile --select +raw_vault.<concept>.hub_<entity> +raw_vault.<concept>.sat_<entity>__<system>
```

## Validation Checklist

- [ ] Business Keys alphabetisch sortiert (hk, dss_business_key)
- [ ] dss_business_key = `default||default||BK1||...||BKn`
- [ ] Hash: SHA2_256, CONVERT (nicht CAST), NULL→'-1', LTRIM/RTRIM
- [ ] src_extra_columns korrekt (Hub: 2, Sat: 1)
- [ ] Keine BK im Satellite payload
- [ ] Keine technischen VS-Attribute im hd (Change Hash)
- [ ] Kommentar-Header vollständig
- [ ] Schema YAML mit Tests (not_null, unique, relationships)
- [ ] ER-Diagramm aktualisiert
- [ ] `dbt compile` erfolgreich

## Troubleshooting

| Problem | Ursache | Lösung |
|---------|---------|--------|
| Schema `dv_vault_sap_co` statt `vault_sap_co` | generate_schema_name Macro fehlt | Prüfe macros/generate_schema_name.sql |
| HASHBYTES truncation | CAST statt CONVERT | Prüfe hash_override.sql |
| Duplicate Hub records | BK Sorting unterschiedlich | Alphabetische Sortierung prüfen |
| Source not found | External Table nicht erstellt | `dbt run-operation stage_external_sources` |

## References

- Confluence ITDATAH §2.1 (Hub), §2.3 (Satellite), §3 (Business Keys), §4 (Hashing)
- `templates/staging.sql` - Staging View Template
- `templates/hub.sql` - Hub Template
- `templates/satellite.sql` - Satellite Template
- `references/entity-checklist.md` - Vollständige Checkliste

---
name: create-dv-entity
description: 'Creates a complete Data Vault entity including staging view, hub, satellite, current view, schema YAML and ER diagram. Use when adding a new source table or business object to the Data Vault. Keywords: hub satellite staging automate_dv hash business key'
---
