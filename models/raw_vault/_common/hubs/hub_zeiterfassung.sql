{#
    Hub: hub_zeiterfassung
    Source: ewb_proj_ntc_main
    Business Keys: EMPLNR, PROJDAT (zusammengesetzter BK: Mitarbeiter + Arbeitstag)

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-14 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_zeiterfassung') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_ntc_main"
src_pk: "hk_zeiterfassung"
src_nk:
    - "emplnr"
    - "projdat"
src_extra_columns:
    - "dss_business_key"
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
