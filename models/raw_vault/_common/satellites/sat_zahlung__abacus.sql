{#
    Satellite: sat_zahlung__abacus
    Parent Hub: hub_zahlung
    Source: ewb_kred_kvl_main

    Payload (17 Spalten — Visierungs-/Zahlungsdaten):
      Visum:     VISIERT, ABGELEHNT, VALIDVISUM, STVVISA, VISUMSTYP
      Workflow:  STATUSID, MSGTASKSTATUS, RGPRUEFUNG
      Benutzer:  ABACUS_USR_GUID, ABACUS_USR_NAME
      Daten:     DATUM_ZEIT, AKTION_DATUM_ZEIT
      Betrag:    FREIGABEBETRAG
      Referenz:  SUBDOCUMENTNR, VER, BENACH_GESANDT, BEMERKUNG

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-30 V1.0 Initialversion (Wave 3 Finance)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_zahlung') }}",
        "{{ update_satellite_current_flag(this, 'hk_zahlung') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_kred_kvl_main"
src_pk: "hk_zahlung"
src_hashdiff:
  source_column: "hd_zahlung"
  alias: "HASHDIFF"
src_payload:
    - "abacus_usr_guid"
    - "abacus_usr_name"
    - "abgelehnt"
    - "aktion_datum_zeit"
    - "bemerkung"
    - "benach_gesandt"
    - "datum_zeit"
    - "freigabebetrag"
    - "msgtaskstatus"
    - "rgpruefung"
    - "statusid"
    - "stvvisa"
    - "subdocumentnr"
    - "validvisum"
    - "ver"
    - "visiert"
    - "visumstyp"
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
