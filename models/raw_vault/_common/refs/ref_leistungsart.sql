/*
 * Reference Table: ref_leistungsart
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_proj_ntr_main (PROJ.NTR.Main.parquet)
 * Primary Key: number (Natural Key — kein Hash Key bei Ref Tables)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 29 distinkte Leistungsarten (NUMBER-Werte).
 * Beispiele: "Normalzeit", "Ueberzeit ohne Zuschlag", "Bezug Ferien"
 * Mart-Bezug: NSA.CODE = NTR.NUMBER fuer Leistungsart-Aufloesung.
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-07-14 V1.0 Initialversion
 */

{{ config(
    materialized='view'
) }}

{%- set yaml_metadata -%}
source_model: "ewb_proj_ntr_main"
src_pk: "number"
src_extra_columns:
    - "description"
    - "type"
    - "inaktiv"
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
