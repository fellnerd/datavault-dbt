{# Satellite: sat_internet_service__idms
   Source: idms_internet_service_main
   Parent Hub: hub_internet_service
   Payload: 14 columns
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('') }}",
        "{{ update_satellite_current_flag(this, '') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "idms_internet_service_main"
src_pk: ""
src_hashdiff:
    source_column: "hd_idms_internet_service"
    alias: "HASHDIFF"
src_payload:
    - "timestamp_landing-zone"
    - "service_subscription_id"
    - "start"
    - "subscription_id"
    - "price_override"
    - "plusip"
    - "plusemail"
    - "managed_wlan"
    - "invoice_type"
    - "end"
    - "custom_attr"
    - "charge_add_mb"
    - "plusemail"
    - "id"
src_extra_columns:
    - "dss_create_datetime"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(src_pk=metadata_dict["src_pk"],
                   src_hashdiff=metadata_dict["src_hashdiff"],
                   src_payload=metadata_dict["src_payload"],
                   src_ldts=metadata_dict["src_ldts"],
                   src_source=metadata_dict["src_source"],
                   src_extra_columns=metadata_dict["src_extra_columns"],
                   source_model=metadata_dict["source_model"]) }}
