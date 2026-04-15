/*
 * Staging Model: ewb_kred_kbl_main
 *
 * Source: ext_ewb_kred_kbl_main (ewb_abacus)
 * Objects: hub_kred_kbl, sat_kred_kbl__abacus
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_kred_kbl_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(CONCAT(ABEA_BES_NR, '||', ABEA_BES_RNR) AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column: "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_kred_kbl:
    - "ABEA_BES_NR"
    - "ABEA_BES_RNR"
  hd_kred_kbl:
    is_hashdiff: true
    columns:
      - "APPROVALEMPLOYEENR"
      - "AUFTRAG"
      - "BEGEZRF"
      - "BEGTLNR"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
