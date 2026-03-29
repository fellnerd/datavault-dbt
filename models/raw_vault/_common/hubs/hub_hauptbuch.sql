{#
    Hub: hub_hauptbuch
    Source: ewb_fibu_gl
    Business Keys: RECNUM

    BK-Entscheidung (29.3.2026): DKBELEGNUMMER+KTO war NICHT unique
    (62% Nullen, bis zu 96 Duplikate pro Kombination).
    RECNUM ist der einzig unique Identifier auf Zeilenebene.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-29 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_hauptbuch') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_fibu_gl"
src_pk: "hk_hauptbuch"
src_nk: "recnum"
src_extra_columns:
    - "dss_business_key"
    - "dss_create_datetime"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.hub(
    src_pk=metadata_dict["src_pk"],
    src_nk=metadata_dict["src_nk"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
