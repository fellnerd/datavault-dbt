{#
    Multi-Active Satellite: sat_vertrag_optionen_ma__compax
    Parent Hub: hub_vertrag
    CDK (Composite Dependent Key): abo_option_name
    Source: rsn_mobile_services_main

    Payload:
      ist_option       — Kennzeichen ob Option aktiv (CHAR(1))
      aktivierungs_datum — Datum der Aktivierung
      kundigungs_datum   — Datum der Kündigung
      mlz_datum          — Mindestlaufzeit-Datum

    Multi-Active Pattern: Jede abo_option_name ist eine separate gültige
    Option am Vertrag. Gleichzeitig mehrere Optionen pro Vertrag möglich.
    KEINE SCD2 Historisierung → automate_dv.ma_sat(), KEINE post_hooks.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
#}

{{ config(
    materialized='incremental',
    as_columnstore=false
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_services_optionen_dedup"
src_pk: "hk_vertrag"
src_cdk: "abo_option_name"
src_hashdiff: "hd_vertrag_optionen_ma"
src_payload:
    - "ist_option"
    - "aktivierungs_datum"
    - "kundigungs_datum"
    - "mlz_datum"
src_eff: "dss_load_date"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.ma_sat(
    src_pk=metadata_dict["src_pk"],
    src_cdk=metadata_dict["src_cdk"],
    src_hashdiff=metadata_dict["src_hashdiff"],
    src_payload=metadata_dict["src_payload"],
    src_eff=metadata_dict["src_eff"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
