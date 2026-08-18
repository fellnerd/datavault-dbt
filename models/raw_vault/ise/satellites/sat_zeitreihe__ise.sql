{#
    Satellite: sat_zeitreihe__ise
    Parent Hub: hub_zeitreihe
    Source: ise_zeitreihe_main
    Hashdiff: hd_zeitreihe__ise

    Payload: Eigenschaften der Zeitreihe selbst — Typ, Einheit, Zeitschritt,
    Energieart, Referenz (Messpunkt bzw. Marktpartner), Standort/Bezügeranlage
    sowie die Gültigkeit der Serie.

    Bewusst NICHT im Payload: Reihenfolge und Gültigkeit der Gruppenzuordnung —
    die hängen an sat_zeitreihe_gruppe__ise. Ohne diesen Split würde jedes
    Umsortieren in der i-SE-Gruppe eine neue Version der Zeitreihe erzeugen.

    Ebenfalls nicht im Payload: die Lineage-Spalten (dss_source_filename,
    dss_run_id, dss_stage_timestamp) — sonst erzeugt jeder Export eine
    Scheinversion, obwohl sich fachlich nichts geändert hat.

    Load Date: Export-Zeitstempel des frühesten Snapshots mit diesem Stand
    ("gültig seit"), abgeleitet in ise_zeitreihe_dedup.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-08-17 V1.0 Initialversion — EWB EDM/i-SE
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_zeitreihe') }}",
        "{{ update_satellite_current_flag(this, 'hk_zeitreihe') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "ise_zeitreihe_main"
src_pk: "hk_zeitreihe"
src_hashdiff:
    source_column: "hd_zeitreihe__ise"
    alias: "HASHDIFF"
src_payload:
    - "id_zeitreihe_typ"
    - "zeitreihe_typ"
    - "zeitreihe_key"
    - "einheit"
    - "zeitschritt_min"
    - "energieart"
    - "referenz_typ"
    - "referenz_id"
    - "referenz"
    - "standort"
    - "bezuegeranlage"
    - "zeitreihe_gueltig_von"
    - "zeitreihe_gueltig_bis"
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
