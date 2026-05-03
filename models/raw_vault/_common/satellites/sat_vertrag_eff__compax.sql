{#
    Effectivity Satellite: sat_vertrag_eff__compax
    Parent Hub: hub_vertrag
    Source: rsn_mobile_services_main

    Payload:
      is_active — Gibt an ob der Vertrag aktiv ist (CHAR(1): 'Y'/'N')

    Effectivity Satellite Pattern: Verfolgt den Aktivitätsstatus eines
    Vertrags über die Zeit. Minimale Payload, nur is_active Flag.
    SCD2 Historisierung via update_satellite_end_date / update_is_current.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_vertrag') }}",
        "{{ update_satellite_end_date(this, 'hk_vertrag', 'dss_load_date') }}",
        "{{ update_is_current(this, 'hk_vertrag', 'dss_load_date') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_services_main"
src_pk: "hk_vertrag"
src_hashdiff:
  source_column: "hd_vertrag_eff"
  alias: "HASHDIFF"
src_payload:
    - "is_active"
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
