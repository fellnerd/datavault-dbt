{#
    Link: link_zeiterfassung_person
    Source Hub: hub_zeiterfassung
    Target Hub: _common.hub_person
    Source: ewb_proj_ntc_main

    Verbindet einen Zeiterfassungs-Eintrag (Mitarbeiter + Tag)
    mit dem entsprechenden Person-Hub-Eintrag via EMPLNR.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-14 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_zeiterfassung_person') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_ntc_main"
src_pk: "hk_link_zeiterfassung_person"
src_fk:
    - "hk_zeiterfassung"
    - "hk_person"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.link(
    src_pk=metadata_dict["src_pk"],
    src_fk=metadata_dict["src_fk"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
