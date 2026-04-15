/*
 * Reference Table: ref_projektkategorie
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_sp_projektekategorien (Sharepoint Finance/ProjekteKategorien)
 * Primary Key: KategorieNr (Natural Key)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * Lookup KategorieNr → KategorieName (Hauptgruppen-Bezeichnungen).
 * Wird via ref_projektkategorisierung mit hub_projekt verknüpft.
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
source_model: "ewb_sp_projektekategorien"
src_pk: "KategorieNr"
src_extra_columns:
    - "KategorieName"
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
