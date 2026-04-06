{#
    Satellite: sat_projektteil__abacus
    Parent Hub: hub_projektteil
    Source: ewb_proj_prt_main

    Payload (4 Spalten):
      DATE     — Projektteil-Datum (SQL Reserved Keyword → [DATE])
      STAT1    — Status 1
      STAT2    — Status 2
      USER_F   — Benutzerfeld

    Wave 3 — Projektteile.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-30 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_projektteil') }}",
        "{{ update_satellite_current_flag(this, 'hk_projektteil') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_prt_main"
src_pk: "hk_projektteil"
src_hashdiff:
  source_column: "hd_projektteil"
  alias: "HASHDIFF"
src_payload:
    - "[date]"
    - "stat1"
    - "stat2"
    - "user_f"
src_extra_columns:
    - "dss_create_datetime"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(
    src_pk=metadata_dict["src_pk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
