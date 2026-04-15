{# Satellite: sat_kred_kbl__abacus
   Source: ewb_kred_kbl_main
   Parent Hub: hub_kred_kbl
   Payload: 0 columns
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
source_model: "ewb_kred_kbl_main"
src_pk: ""
src_hashdiff:
    source_column: "hd_kred_kbl"
    alias: "HASHDIFF"
src_payload: []
src_extra_columns:
    - "dss_create_datetime"
    - "APPROVALEMPLOYEENR"
    - "AUFTRAG"
    - "BEGEZRF"
    - "BEGTLNR"
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
