{#
    Satellite: sat_buchungskopf__abacus
    Parent Hub: hub_buchungskopf
    Source: ewb_fibu_fhe_main

    Payload (20 Spalten — Standard-Set, Synapse-aligned + Business-Erweiterungen):
      Struktur:    PLAN, LEVEL, VARIANTE, TYP, ID, ID_ASCII, IDTYP_ASCII
      Referenzen:  REF_LEVEL, REF_ID, REF_TYP, ZUONR
      Layout:      BOTTOM, FONTID, INDENT (minimal, für Hierarchie-Darstellung)
      Audit:       CREDAT, CREUSER, MUTDAT, MUTUSER
      System:      ENTERPRISE, GUID

    Entfernt (37 Spalten): APP*/SYS*-Reserve (27), Formatierung (8), NODEFAULT, DECIMALS

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-29 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_buchungskopf') }}",
        "{{ update_satellite_current_flag(this, 'hk_buchungskopf') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_fibu_fhe_main"
src_pk: "hk_buchungskopf"
src_hashdiff:
  source_column: "hd_buchungskopf"
  alias: "HASHDIFF"
src_payload:
    - "bottom"
    - "credat"
    - "creuser"
    - "enterprise"
    - "fontid"
    - "guid"
    - "id"
    - "id_ascii"
    - "idtyp_ascii"
    - "indent"
    - "[level]"
    - "mutdat"
    - "mutuser"
    - "[plan]"
    - "ref_id"
    - "ref_level"
    - "ref_typ"
    - "typ"
    - "variante"
    - "zuonr"
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
