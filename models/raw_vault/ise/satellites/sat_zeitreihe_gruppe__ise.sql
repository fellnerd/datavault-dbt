{#
    Satellite: sat_zeitreihe_gruppe__ise
    Parent: link_zeitreihe_gruppe  (Satellit AM LINK, nicht am Hub)
    Source: ise_zeitreihe_main
    Hashdiff: hd_zeitreihe_gruppe

    Payload: Attribute der ZUORDNUNG Zeitreihe ↔ Gruppe — Bezeichnung der Gruppe,
    Sortierreihenfolge und Gültigkeit der Zuordnung (i-SE
    Techanl.ZEITREIHEGRUPPEZUORD.GueltigVon/GueltigBis/Reihenfolge).

    Warum am Link und nicht am Hub: Die Zugehörigkeit ist eine Eigenschaft der
    Beziehung, nicht der Zeitreihe. Läge sie am Hub, könnte eine Zeitreihe nicht
    gleichzeitig in mehreren Gruppen mit unterschiedlicher Reihenfolge liegen.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-08-17 V1.0 Initialversion — EWB EDM/i-SE
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_link_zeitreihe_gruppe') }}",
        "{{ update_satellite_current_flag(this, 'hk_link_zeitreihe_gruppe') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ise_zeitreihe_main"
src_pk: "hk_link_zeitreihe_gruppe"
src_hashdiff:
    source_column: "hd_zeitreihe_gruppe"
    alias: "HASHDIFF"
src_payload:
    - "zeitreihegruppe"
    - "reihenfolge"
    - "gruppe_gueltig_von"
    - "gruppe_gueltig_bis"
src_extra_columns:
    - "dss_create_datetime"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(src_pk=metadata_dict["src_pk"],
                   src_hashdiff=metadata_dict["src_hashdiff"],
                   src_payload=metadata_dict["src_payload"],
                   src_ldts=metadata_dict["src_ldts"],
                   src_source=metadata_dict["src_source"],
                   src_extra_columns=metadata_dict["src_extra_columns"],
                   source_model=metadata_dict["source_model"]) }}
