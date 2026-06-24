{#
    Hub: hub_adresse
    Sources:
      - ewb_publ_adr_main  (Abacus PUBL.ADR — BK: INR)
      - idms_address_main  (IDMS address — BK: id, aliasiert als inr)

    Cross-Source Integration: Beide Quellen liefern Adressentitäten in denselben Hub.
    Der gemeinsame Business Key heisst 'inr' in beiden Staging-Views.
    Jede Quelle erhält einen eigenen Satellite (__abacus / __idms).

    Version:   2026-06-17 V2.0 Multi-Source (Abacus + IDMS)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_adresse') }}"]
) }}

{%- set yaml_metadata -%}
source_model:
  - "ewb_publ_adr_main"
  - "idms_address_main"
src_pk: "hk_adresse"
src_nk: "inr"
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
