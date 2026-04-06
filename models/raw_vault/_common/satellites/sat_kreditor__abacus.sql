{#
    Satellite: sat_kreditor__abacus
    Parent Hub: hub_kreditor (Ghost Hub)
    Source: ewb_kred_kbl_main

    Payload (2 Spalten — Ghost-Hub-Satellite):
      Stammdaten:  ADRID (Adress-ID / Kreditorname), FADRINR (FK Adressstamm)

    Ghost Hub Satellite — Kreditoren-Stammdaten werden aus den
    Kreditorenbelegen (KRED.KBL.Main) abgeleitet. Beide Spalten sind
    1:1 pro KNR (3159/3159 Kreditoren, 100% befüllt).

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-29 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_kreditor') }}",
        "{{ update_satellite_current_flag(this, 'hk_kreditor') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_kred_kbl_main"
src_pk: "hk_kreditor"
src_hashdiff:
  source_column: "hd_kreditor"
  alias: "HASHDIFF"
src_payload:
    - "adrid"
    - "fadrinr"
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
