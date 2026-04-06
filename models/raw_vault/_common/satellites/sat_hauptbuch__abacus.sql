{#
    Satellite: sat_hauptbuch__abacus
    Parent Hub: hub_hauptbuch
    Source: ewb_fibu_gl

    Payload (36 Spalten — Standard-Set, Synapse-aligned + Business-Erweiterungen):
      FK-Denorm:     KTO, DKBELEGNUMMER (auch in Links, hier fuer Mart-Zugriff ohne Cross-Product)
      Kernbuchung:   BELNR, DATE, SH, BETRAG, GKTO, KST, KST2, WAEHR, TEXT, TEXT2, SAM, SAMNR, CODE
      MWST:          MWSTBETR, MWSTTYP, MWSTCODE, MWSTINCL, MWSTSATZ, MWSTKTO, MWSTMONAT, MWSTJAHR, MWSTLAND, MWSTMETH
      Fremdwährung:  FRW, FBETR, ISO, FWAUTO
      Konsolidierung: COMPANY, DIVISION, MANDANT
      Projekt-Refs:  PROJ, PROJEBENE
      Kunden-Refs:   DKKUNDENNUMMER, DKPOSNUMMER

    Entfernt (142 Spalten): Immo/Inve/Clearing/Zielgb/Reserve/Debug + APP/SYS-Felder

    BK-Hinweis: RECNUM als Hub-BK (nicht DKBELEGNUMMER+KTO).
    Reserved Keywords: DATE, TEXT — im Staging via derived_columns escaped.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-29 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_hauptbuch') }}",
        "{{ update_satellite_current_flag(this, 'hk_hauptbuch') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_fibu_gl"
src_pk: "hk_hauptbuch"
src_hashdiff:
  source_column: "hd_hauptbuch"
  alias: "HASHDIFF"
src_payload:
    - "kto"
    - "dkbelegnummer"
    - "belnr"
    - "betrag"
    - "code"
    - "company"
    - "date"
    - "division"
    - "dkkundennummer"
    - "dkposnummer"
    - "fbetr"
    - "frw"
    - "fwauto"
    - "gkto"
    - "iso"
    - "kst"
    - "kst2"
    - "mandant"
    - "mwstbetr"
    - "mwstcode"
    - "mwstincl"
    - "mwstjahr"
    - "mwstkto"
    - "mwstland"
    - "mwstmeth"
    - "mwstmonat"
    - "mwstsatz"
    - "mwsttyp"
    - "proj"
    - "projebene"
    - "sam"
    - "samnr"
    - "sh"
    - "text"
    - "text2"
    - "waehr"
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
