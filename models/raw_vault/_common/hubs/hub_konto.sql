{#
    Hub: hub_konto (Ghost Hub)
    Source: ewb_fibu_gl
    Business Keys: KTO (Konto-Nummer)

    Ghost Hub — hat keine eigene Abacus-Staging-Quelle.
    Die Konto-Nr wird aus den Hauptbuch-Buchungszeilen (FIBU.GL) abgeleitet.
    Stammdaten (Kontenplan) werden separat via ref_konto (Sharepoint) bereitgestellt.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-30 V1.0 Initialversion (Wave 3 Sharepoint-Integration)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_konto') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_fibu_gl"
src_pk: "hk_konto"
src_nk: "kto"
src_extra_columns:
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
