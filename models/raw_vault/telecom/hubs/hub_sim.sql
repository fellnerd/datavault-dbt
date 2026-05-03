{#
    Hub: hub_sim
    Source: rsn_mobile_services_main
    Business Keys: icc

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_sim') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_services_main"
src_pk: "hk_sim"
src_nk: "icc"
src_extra_columns:
    - "dss_business_key_sim"
    - "dss_create_datetime"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.hub(
    src_pk=metadata_dict["src_pk"],
    src_nk=metadata_dict["src_nk"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
