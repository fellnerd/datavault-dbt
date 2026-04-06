{#
    Satellite: sat_projekt__abacussachkonto__abacus
    Parent Hub: hub_projektsachkonto
    Source: ewb_proj_nsa_main

    Payload (12 Spalten — Budget/Ist-Vergleich intern + extern):
      Intern:  BUDGETINT, BETRAGINT, VORTRAGINT, AZBUTINT, AZBETINT, AZVORTINT
      Extern:  BUDGETEXT, BETRAGEXT, VORTRAGEXT, AZBUTEXT, AZBETEXT, AZVORTEXT

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-07-14 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_projektsachkonto') }}",
        "{{ update_satellite_current_flag(this, 'hk_projektsachkonto') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_nsa_main"
src_pk: "hk_projektsachkonto"
src_hashdiff:
  source_column: "hd_projektsachkonto"
  alias: "HASHDIFF"
src_payload:
    - "budgetint"
    - "betragint"
    - "vortragint"
    - "budgetext"
    - "betragext"
    - "vortragext"
    - "azbutint"
    - "azbetint"
    - "azvortint"
    - "azbutext"
    - "azbetext"
    - "azvortext"
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
