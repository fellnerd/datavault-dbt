/*
 * Staging Model: idms_internet_service_main
 *
 * Source: ext_idms_internet_service_main (idms)
 * Objects: hub_internet_service
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_idms_internet_service_main"

derived_columns:
  dss_record_source: "!ewb_idms"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(id AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "start"
      - "end"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_internet_service: "id"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
