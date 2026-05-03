{#
    Effectivity Satellite: sat_vertrag_eff__compax
    Parent Link: link_vertrag_kunde
    Driving FK (DFK): hk_vertrag
    Secondary FK (SFK): hk_kunde
    Source: rsn_mobile_services_main

    Verfolgt die fachliche Gültigkeit der Vertrag-Kunde-Beziehung über Zeit:
      aktivierungs_datum → START_DATE  (Vertragsbeginn)
      kundigungs_datum   → END_DATE    (Kündigungsdatum; 9999-12-31 = offen)

    automate_dv.eff_sat() verwaltet Open/Close-Perioden automatisch:
    - Neuer Record wenn DFK+SFK-Kombination erstmals auftaucht
    - END_DATE wird geschlossen wenn DFK mit anderem SFK erscheint

    Developer: Daniel Fellner, MSc
    Company:   ppmc analytics ag
    Contact:   office@ppmcag.com
    Version:   2025-05-03 V1.0 Initialversion — EWB CDR-Projekt (RSN Mobile / Compax)
               2025-05-03 V1.1 Korrektur: automate_dv.eff_sat() statt sat() — Link-basiert
#}

{{ config(
    materialized='incremental',
    as_columnstore=false,
    post_hook=["{{ create_hash_index('hk_link_vertrag_kunde') }}"]
) }}

{%- set yaml_metadata -%}
source_model: "rsn_mobile_services_main"
src_pk: "hk_link_vertrag_kunde"
src_dfk: "hk_vertrag"
src_sfk: "hk_kunde"
src_start_date: "aktivierungs_datum"
src_end_date: "kundigungs_datum"
src_eff: "dss_load_date"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.eff_sat(
    src_pk=metadata_dict["src_pk"],
    src_dfk=metadata_dict["src_dfk"],
    src_sfk=metadata_dict["src_sfk"],
    src_start_date=metadata_dict["src_start_date"],
    src_end_date=metadata_dict["src_end_date"],
    src_eff=metadata_dict["src_eff"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
