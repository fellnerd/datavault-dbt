{#
    Transaction Link: link_cdr_event_tl
    FK 1: hk_vertrag (vault._common.hub_vertrag)
    FK 2: hk_sim (vault_telecom.hub_sim)
    Source: rsn_mobile_cdr_main

    Transaction Link für CDR-Events (Call Detail Records).
    Jeder CDR-Eintrag ist eine atomare Transaktion zwischen Vertrag und SIM.
    Als Transaction Link ist er nie-historisiert — jeder Record ist ein Fakt.
    Der zugehörige Transaction Satellite (sat_cdr_event__compax) trägt die Payload.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_link_cdr_event_tl') }}",
        "{{ create_hash_index('hk_vertrag') }}",
        "{{ create_hash_index('hk_sim') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_cdr_main"
src_pk: "hk_link_cdr_event_tl"
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
