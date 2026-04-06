{#
    Satellite: sat_kreditorenbeleg__abacus
    Parent Hub: hub_kreditorenbeleg
    Source: ewb_kred_kbl_main

    Payload (32 Spalten — Standard-Set, Synapse-aligned + Business-Erweiterungen):
      Beleg:       BELART, BELDEF, BELREF
      Status:      STATID, STATDEF, GESPERRT
      Finanzen:    BWBTR, LWBTR, BWOPBTR, LWOPBTR, MWSBWBTR, MWSLWBTR
      Währung:     BWWRC, LWWRC
      Skonto:      SKONTO1P/T, SKONTO2P/T, SKONTO3P/T
      Zahlung:     ZLGWEG, FRIST
      Datum:       ERFDAT, MUTDAT, FBELDAT, KBELDAT, KDSPDAT, LETZTEZLG
      Projekt:     PROJEKT, KST1, KST2
      Audit:       ERFUSER, USER_F

    Entfernt (84 Spalten): Reserve/Sammelbuchung/Hilfs*/Ext*/IG*/MWST-Reserve/System-IDs

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-29 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_kreditorenbeleg') }}",
        "{{ update_satellite_current_flag(this, 'hk_kreditorenbeleg') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_kred_kbl_main"
src_pk: "hk_kreditorenbeleg"
src_hashdiff:
  source_column: "hd_kreditorenbeleg"
  alias: "HASHDIFF"
src_payload:
    - "belart"
    - "beldef"
    - "belref"
    - "bwbtr"
    - "bwopbtr"
    - "bwwrc"
    - "erfdat"
    - "erfuser"
    - "fbeldat"
    - "frist"
    - "gesperrt"
    - "kbeldat"
    - "kdspdat"
    - "kst1"
    - "kst2"
    - "letztezlg"
    - "lwbtr"
    - "lwopbtr"
    - "lwwrc"
    - "mutdat"
    - "mwsbwbtr"
    - "mwslwbtr"
    - "projekt"
    - "skonto1p"
    - "skonto1t"
    - "skonto2p"
    - "skonto2t"
    - "skonto3p"
    - "skonto3t"
    - "statdef"
    - "statid"
    - "user_f"
    - "zlgweg"
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
