{#
    Satellite: sat_zeiterfassung__abacus
    Parent Hub: hub_zeiterfassung
    Source: ewb_proj_ntc_main

    Payload (22 Spalten):
      Zeitintervalle: from1, to1, from2, to2, from3, to3, from4, to4, from5, to5,
                      from6, to6, from7, to7, from8, to8, from9, to9, from10, to10
      Stunden:        anzahl
      Benutzer:       user_f

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-14 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_zeiterfassung') }}",
        "{{ update_satellite_current_flag(this, 'hk_zeiterfassung') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_ntc_main"
src_pk: "hk_zeiterfassung"
src_hashdiff:
  source_column: "hd_zeiterfassung"
  alias: "HASHDIFF"
src_payload:
    - "from1"
    - "to1"
    - "from2"
    - "to2"
    - "from3"
    - "to3"
    - "from4"
    - "to4"
    - "from5"
    - "to5"
    - "from6"
    - "to6"
    - "from7"
    - "to7"
    - "from8"
    - "to8"
    - "from9"
    - "to9"
    - "from10"
    - "to10"
    - "anzahl"
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
