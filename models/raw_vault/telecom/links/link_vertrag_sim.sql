{#
    Link: link_vertrag_sim
    Hub 1: hub_vertrag (vault._common)
    Hub 2: hub_sim (vault_telecom)
    Source: rsn_mobile_services_main

    Cross-Schema Link: Verbindet einen Mobilfunk-Vertrag (_common) mit
    der zugehörigen SIM-Karte (telecom).
    Eine SIM ist einem Vertrag zugeordnet; ein Vertrag kann mehrere SIMs haben.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_vertrag_sim') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_services_main"
src_pk: "hk_link_vertrag_sim"
src_fk:
    - "hk_vertrag"
    - "hk_sim"
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
