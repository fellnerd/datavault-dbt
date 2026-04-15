/*
 * Reference Table: ref_projektkategorisierung
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_sp_kategorisierungprojekte (Sharepoint Finance/KategorisierungProjekte)
 * Primary Key: Projektnummer (Natural Key)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * Mapping Projektnummer → KategorieNr (Hauptgruppe-Zuordnung).
 * Join mit hub_projekt über PROJNR = Projektnummer.
 * Für Hauptgruppe-Namen: JOIN ref_projektkategorie über KategorieNr.
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-04-15 V1.0 Initialversion (Vault-Migration aus Mart)
 */

{{ config(
    materialized='view'
) }}

{%- set yaml_metadata -%}
source_model: "ewb_sp_kategorisierungprojekte"
src_pk: "Projektnummer"
src_extra_columns:
    - "KategorieNr"
    - "KostenstelleName"
src_ldts: "dss_load_date"
src_source: "dss_record_source"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.ref_table(
    src_pk=metadata_dict["src_pk"],
    src_extra_columns=metadata_dict["src_extra_columns"],
    src_ldts=metadata_dict["src_ldts"],
    src_source=metadata_dict["src_source"],
    source_model=metadata_dict["source_model"]
) }}
