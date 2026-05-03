{#
    Link: link_vertrag_kunde
    Hub 1: hub_vertrag (_common)
    Hub 2: hub_kunde (_common)
    Source: rsn_mobile_services_main

    Verbindet einen Mobilfunk-Vertrag mit dem zugehörigen Kunden (Compax).
    N:1 Beziehung: Ein Vertrag hat genau einen Kunden, ein Kunde kann mehrere Verträge haben.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_vertrag_kunde') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_services_main"
src_pk: "hk_link_vertrag_kunde"
src_fk:
    - "hk_vertrag"
    - "hk_kunde"
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
