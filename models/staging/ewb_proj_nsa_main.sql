/*
 * Staging Model: ewb_proj_nsa_main
 *
 * Source: ext_ewb_proj_nsa_main (Abacus PROJ.NSA.Main)
 * Business Key: PROJNR, CODE, PERIYEAR, PERIMONTH, GB, DATASET (Composite)
 * Hash Key: hk_projektsachkonto
 * Link: hk_link_projektsachkonto_projekt → hub_projekt
 * Payload: 12 Budget/Ist Spalten
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_proj_nsa_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(PROJNR AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(CODE AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(PERIYEAR AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(PERIMONTH AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(GB AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(DATASET AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column: "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_projektsachkonto:
    - "PROJNR"
    - "CODE"
    - "PERIYEAR"
    - "PERIMONTH"
    - "GB"
    - "DATASET"
  hk_projekt: "PROJNR"
  hk_link_projektsachkonto_projekt:
    - "PROJNR"
    - "CODE"
    - "PERIYEAR"
    - "PERIMONTH"
    - "GB"
    - "DATASET"
    - "PROJNR"
  hd_projektsachkonto:
    is_hashdiff: true
    columns:
      - "AZBETEXT"
      - "AZBETINT"
      - "AZBUTEXT"
      - "AZBUTINT"
      - "AZVORTEXT"
      - "AZVORTINT"
      - "BETRAGEXT"
      - "BETRAGINT"
      - "BUDGETEXT"
      - "BUDGETINT"
      - "VORTRAGEXT"
      - "VORTRAGINT"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
