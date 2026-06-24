{#
    Satellite: sat_adresse__idms
    Parent Hub: hub_adresse
    Source: idms_address_main

    Payload (21 Spalten — Adress- und Kontaktdaten aus IDMS):
      Identität:    firma, nachname, vorname, anrede (INT-Code), zusatz
      Adresse:      strasse, strasse_nr, plzort (INT), postfach, egid (Gebäude-ID)
      Kontakt:      tel, telg (Geschäft), telm (Mobil), fax, emailaddr
      Referenzen:   cust_id (INT-FK), mandate_id (INT-FK), ref, flags (INT), free_field, status (INT)

    Hinweis: cust_id und mandate_id sind fachlich Foreign Keys, werden in Phase 1
    als Attribute (Option A) behandelt — sie sind im Hashdiff enthalten und bekommen
    keinen separaten Hash Key. Felder ts und timestamp_landing-zone sind Systemstempel
    und bewusst NICHT im Hashdiff.

    Version:   2026-06-17 V1.0 Initialversion (aus hub_idms_address Migration)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=[
        "{{ create_hash_index('hk_adresse') }}",
        "{{ update_satellite_current_flag(this, 'hk_adresse') }}"
    ]
) }}

{%- set yaml_metadata -%}
source_model: "idms_address_main"
src_pk: "hk_adresse"
src_hashdiff:
  source_column: "hd_adresse__idms"
  alias: "HASHDIFF"
src_payload:
    - "anrede"
    - "cust_id"
    - "egid"
    - "emailaddr"
    - "fax"
    - "firma"
    - "flags"
    - "free_field"
    - "mandate_id"
    - "nachname"
    - "plzort"
    - "postfach"
    - "ref"
    - "status"
    - "strasse"
    - "strasse_nr"
    - "tel"
    - "telg"
    - "telm"
    - "vorname"
    - "zusatz"
src_extra_columns:
    - "dss_create_datetime"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.sat(
    src_pk=metadata_dict["src_pk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
