{#
    Link: link_projektsachkonto_projekt
    Source Hub 1: hub_projektsachkonto (PROJNR^^CODE^^PERIYEAR^^PERIMONTH^^GB)
    Source Hub 2: hub_projekt (PROJNR)
    Source: ewb_proj_nsa_main

    Verbindet ein Projektsachkonto (Budget/Ist pro Periode) mit dem
    zugehoerigen Projekt via PROJNR.
    97.5% Match NSA.PROJNR → NPO.PROJNR bestaetigt.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-07-14 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_projektsachkonto_projekt') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_nsa_main"
src_pk: "hk_link_projektsachkonto_projekt"
src_fk:
    - "hk_projektsachkonto"
    - "hk_projekt"
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
