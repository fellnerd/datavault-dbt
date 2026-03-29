{#
    Satellite: sat_buchungskopf__abacus
    Parent Hub: hub_buchungskopf
    Source: ewb_fibu_fhe_main

    Payload (57 Spalten — vollständig):
      Struktur:    PLAN, LEVEL, VARIANTE, TYP, ID, REF_LEVEL, REF_ID, REF_TYP
      Formatierung: BOTTOM, FONTID, BEFORE, AFTER, BOLDSW, ULINESW, ITALICSW,
                    SUPPRESS, NONUM, FORMFEED, INDENT, NODEFAULT, DECIMALS
      System:      SYSSW1-4, SYSDAT1-2, ENTERPRISE, GUID
      Applikation: APPSW1-10, APPNUM1-6, APPDAT1-2, APPGUID1-3
      Audit:       CREDAT, CREUSER, MUTDAT, MUTUSER
      Sonstiges:   ID_ASCII, IDTYP_ASCII, ZUONR

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
    - "after"
    - "appdat1"
    - "appdat2"
    - "appguid1"
    - "appguid2"
    - "appguid3"
    - "appnum1"
    - "appnum2"
    - "appnum3"
    - "appnum4"
    - "appnum5"
    - "appnum6"
    - "appsw1"
    - "appsw10"
    - "appsw2"
    - "appsw3"
    - "appsw4"
    - "appsw5"
    - "appsw6"
    - "appsw7"
    - "appsw8"
    - "appsw9"
    - "before"
    - "boldsw"
    - "bottom"
    - "credat"
    - "creuser"
    - "decimals"
    - "enterprise"
    - "fontid"
    - "formfeed"
    - "guid"
    - "id"
    - "id_ascii"
    - "idtyp_ascii"
    - "indent"
    - "italicsw"
    - "level"
    - "mutdat"
    - "mutuser"
    - "nodefault"
    - "nonum"
    - "plan"
    - "ref_id"
    - "ref_level"
    - "ref_typ"
    - "suppress"
    - "sysdat1"
    - "sysdat2"
    - "syssw1"
    - "syssw2"
    - "syssw3"
    - "syssw4"
    - "typ"
    - "ulinesw"
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
