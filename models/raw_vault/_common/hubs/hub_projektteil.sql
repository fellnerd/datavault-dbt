{#
    Hub: hub_projektteil
    Source: ewb_proj_prt_main
    Business Keys: RECNUM

    Projektteil-Hub (PROJ.PRT). Jeder Projektteil hat eine eigene
    Identität (RECNUM) und gehört über PROJNR zu einem Projekt (NPO).
    Wave 3 — Projektteile.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-30 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_projektteil') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_prt_main"
src_pk: "hk_projektteil"
src_nk: "recnum"
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
