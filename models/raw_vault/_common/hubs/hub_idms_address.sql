{#
    Hub: hub_idms_address
    Source: idms_address_main
    Business Keys: id

    Beschreibung:
      Zentrale Adress-/Kontaktdaten-Entität aus dem IDMS-System (Identitäts-
      Management-System). Jede IDMS-Adresse wird durch eine eindeutige id (INT)
      identifiziert. cust_id und mandate_id sind fachlich Foreign Keys, werden
      in Phase 1 als Attribute (Option A) behandelt und haben keinen eigenen HK.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-06-17 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_idms_address') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "idms_address_main"
src_pk: "hk_idms_address"
src_nk: "id"
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
