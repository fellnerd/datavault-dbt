{#
    Link: link_kunde_adresse
    Source Hub 1: hub_kunde (vault)
    Source Hub 2: hub_adresse (vault)
    Source: rsn_mobile_services_kunde_dedup

    Verbindet Compax-Kunden (RSN Mobile) mit Abacus-Adressen via external_customer_id = INR.
    Match-Rate: 61% (2.736 / 4.475 Kunden). CXL_-Prefix = stornierte Kunden (bereinigt).
    NULL external_customer_id oder nicht-castbare Werte = kein Link-Record (null_placeholder '-1').

    Hash-Normalisierung:
    hub_adresse.INR wird als DECIMAL(38,18) gespeichert → CAST erzeugt '13761.000000000000000000'.
    adresse_bk in rsn_mobile_services_main normalisiert external_customer_id auf dasselbe Format,
    damit die SHA2_256-Hashes übereinstimmen.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-05-05 V1.0 Initialversion
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_kunde_adresse') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_services_kunde_dedup"
src_pk: "hk_link_kunde_adresse"
src_fk:
    - "hk_kunde"
    - "hk_adresse"
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
