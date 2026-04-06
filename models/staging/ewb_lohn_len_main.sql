/*
 * Staging Model: ewb_lohn_len_main
 *
 * Source: ext_ewb_lohn_len_main (Abacus LOHN.LEN.Main)
 * Business Key: EMPL_NR
 * Hash Key: hk_person
 * Payload: 20 Spalten — nur gepflegte Spalten (datenbasiert bereinigt)
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_lohn_len_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(EMPL_NR AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "TYPE"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_person: "EMPL_NR"
  hd_person:
    is_hashdiff: true
    columns:
      - "ABRV"
      - "ADR_INR"
      - "BADGE_ID"
      - "BIRTH_PLACE"
      - "BIRTHDAY"
      - "DATE_IN"
      - "DATE_OUT"
      - "EMPL_ID"
      - "FIRST_NAME"
      - "HOME_DEPT_NR"
      - "LAST_NAME"
      - "LPE_MONTH"
      - "LPE_YEAR"
      - "MUTATION_DATE"
      - "NATIONALITY"
      - "RELEVANT_FOR_LOGIB"
      - "SEX"
      - "SOC_INSURANCE_NR"
      - "TYPE"
      - "ZEMIS_NR"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}