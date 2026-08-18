{#
    Hub: hub_zeitreihe
    Source: ise_zeitreihe_main
    Business Key: id_zeitreihe (i-SE Techanl.ZEITREIHE.ID_Zeitreihe)

    Zentrale Entität der EDM-Domäne: eine Energie-Zeitreihe im i-SE-Zeitreihenmodul.
    Geladen wird ausschliesslich aus den Stammdaten, nicht aus den Lastgängen —
    ise_lastgang_dedup löst die Serie per INNER JOIN über die Stammdaten auf,
    kann also keinen Schlüssel liefern, den es hier nicht schon gibt.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-08-17 V1.0 Initialversion — EWB EDM/i-SE (Zeitreihegruppe "ewb_Power BI")
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_zeitreihe') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ise_zeitreihe_main"
src_pk: "hk_zeitreihe"
src_nk: "id_zeitreihe"
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
