/*
 * Staging Model: ewb_proj_ntc_main
 *
 * Source: ext_ewb_proj_ntc_main (Abacus PROJ.NTC.Main)
 * Business Key: EMPLNR, PROJDAT (Composite)
 * Hash Key: hk_zeiterfassung
 * Link: hk_link_zeiterfassung_person → hub_person
 * Payload: 24 Spalten — Zeitintervalle, Stunden, Audit
 *
 * Note: PROJDAT_KEY derived column for deterministic date hashing
 *       (DATETIME2 → ISO 8601 string via CONVERT style 126)
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_proj_ntc_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(EMPLNR AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CONVERT(NVARCHAR(MAX), PROJDAT, 126))), '-1'))"
  PROJDAT_KEY: "CONVERT(NVARCHAR(30), PROJDAT, 126)"
  _escape:
    source_column: "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_zeiterfassung:
    - "EMPLNR"
    - "PROJDAT_KEY"
  hk_person: "EMPLNR"
  hk_link_zeiterfassung_person:
    - "EMPLNR"
    - "PROJDAT_KEY"
    - "EMPLNR"
  hd_zeiterfassung:
    is_hashdiff: true
    columns:
      - "ANZAHL"
      - "DATASET"
      - "FROM1"
      - "FROM10"
      - "FROM2"
      - "FROM3"
      - "FROM4"
      - "FROM5"
      - "FROM6"
      - "FROM7"
      - "FROM8"
      - "FROM9"
      - "MUTDAT"
      - "TO1"
      - "TO10"
      - "TO2"
      - "TO3"
      - "TO4"
      - "TO5"
      - "TO6"
      - "TO7"
      - "TO8"
      - "TO9"
      - "USER_F"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
