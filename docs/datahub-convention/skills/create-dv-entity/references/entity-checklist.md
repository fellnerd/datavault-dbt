# Entity Creation Checklist

## Pre-Creation
- [ ] Source table identified (name, schema, columns)
- [ ] Business Key columns identified (Natural Keys)
- [ ] BK columns sorted alphabetically
- [ ] Source system key determined (e.g., `sap_co`, `jira`)
- [ ] Concept folder exists or planned
- [ ] No existing Hub with same semantic meaning

## Staging View
- [ ] `automate_dv.stage()` used
- [ ] `derived_columns` complete:
  - [ ] `dss_record_source` as literal (`!system.db.schema.table`)
  - [ ] `dss_load_date` = `GETDATE()`
  - [ ] `dss_create_datetime` = `GETDATE()`
  - [ ] `dss_business_key` = `CONCAT_WS('||', 'default', 'default', BK1, ..., BKn)`
- [ ] `hashed_columns` correct:
  - [ ] `hk_<entity>`: BK columns alphabetically
  - [ ] `hd_<entity>`: All non-BK attributes alphabetically, `is_hashdiff: true`
- [ ] No technische VS-Attribute in `hd` (z.B. ERDAT, UNAME)
- [ ] Comment header complete

## Hub
- [ ] `automate_dv.hub()` used
- [ ] `src_nk` = BK columns alphabetically
- [ ] `src_extra_columns` = `['dss_business_key', 'dss_create_datetime']`
- [ ] `source_model` references staging view
- [ ] Comment header with Aufbau-Tabelle

## Satellite
- [ ] `automate_dv.sat()` used
- [ ] `src_hashdiff` = `{ source_column: 'hd_<entity>', alias: 'HASHDIFF' }`
- [ ] `src_payload` contains ALL non-BK attributes
- [ ] `src_extra_columns` = `['dss_create_datetime']`
- [ ] `dss_create_datetime` NOT in payload (würde in HASHDIFF einfließen)
- [ ] Comment header with separation rationale

## Current View
- [ ] `satellite_current_view()` macro used
- [ ] `materialized='view'` config
- [ ] Correct hashkey_column and hashdiff_column

## Documentation
- [ ] Schema YAML created/updated (`_<concept>__models.yml`)
- [ ] Tests: not_null, unique on HK; not_null on BK; relationships on Sat→Hub
- [ ] ER Diagram updated (`design/raw-vault/<concept>/er-diagram.mmd`)

## Post-Creation
- [ ] `dbt compile` successful
- [ ] Business Key sorting verified
- [ ] Hash calculation consistent with hash_override.sql
- [ ] Ghost Records configured (when activated)
