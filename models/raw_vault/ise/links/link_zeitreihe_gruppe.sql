{#
    Link: link_zeitreihe_gruppe
    Hub 1: hub_zeitreihe        (vault_ise)
    Hub 2: hub_zeitreihegruppe  (vault_ise)
    Source: ise_zeitreihe_main

    Bildet die Zuordnung Zeitreihe ↔ Zeitreihegruppe ab (i-SE
    Techanl.ZEITREIHEGRUPPEZUORD). Die Beziehung ist M:N — eine Zeitreihe kann in
    mehreren Gruppen liegen, eine Gruppe enthält viele Zeitreihen (Gruppe 150 hat
    41, "ewb Tarif 2027 Haushalt mit Smartmeter" 6'187).

    Die Attribute der Zuordnung (Reihenfolge, Gültigkeit) hängen an
    sat_zeitreihe_gruppe__ise, nicht am Link selbst.

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2026-08-17 V1.0 Initialversion — EWB EDM/i-SE
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_zeitreihe_gruppe') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "ise_zeitreihe_main"
src_pk: "hk_link_zeitreihe_gruppe"
src_fk:
    - "hk_zeitreihe"
    - "hk_zeitreihegruppe"
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
