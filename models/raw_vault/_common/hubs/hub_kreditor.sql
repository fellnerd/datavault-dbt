{#
    Hub: hub_kreditor (Ghost Hub)
    Source: ewb_kred_kbl_main
    Business Keys: KNR (Kreditoren-Nummer)

    Ghost Hub — hat keine eigene Staging-Quelle.
    Die Kreditoren-Nr wird aus den Kreditorenbelegen (KRED.KBL.Main) abgeleitet.
    Dies ist ein legitimes DV2.1-Pattern für Entitäten, die nur über
    Transaktionsdaten identifiziert werden.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-03-29 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_kreditor') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ewb_kred_kbl_main"
src_pk: "hk_kreditor"
src_nk: "knr"
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
