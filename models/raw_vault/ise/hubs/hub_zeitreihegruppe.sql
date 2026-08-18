{#
    Hub: hub_zeitreihegruppe
    Source: ise_zeitreihe_main
    Business Key: id_zeitreihegruppe (i-SE Techanl.ZEITREIHEGRUPPE.ID_ZEITREIHEGRUPPE)

    Zeitreihegruppen sind die kuratierten Auswahlmengen in i-SE (43 Stück im
    Quellsystem). Der aktuelle Export deckt Gruppe 150 "ewb_Power BI" ab; der Hub
    ist bewusst als eigene Entität modelliert, damit weitere Gruppen ohne
    Strukturänderung dazukommen können.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-08-17 V1.0 Initialversion — EWB EDM/i-SE
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_zeitreihegruppe') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ise_zeitreihe_main"
src_pk: "hk_zeitreihegruppe"
src_nk: "id_zeitreihegruppe"
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
