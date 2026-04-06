/*
 * Reference Table: ref_projektstatus
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_proj_pst_main (PROJ.PST.Main.parquet)
 * Primary Key: status (Natural Key — kein Hash Key bei Ref Tables)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 7 Projektstatus-Werte: z.B. "Aktiv", "zum Fakturieren"
 * Mart-Bezug: NPO.STATUS = PST.STATUS fuer Status-Aufloesung.
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
source_model: "ewb_proj_pst_main"
src_pk: "status"
src_extra_columns:
    - "bezeichn"
    - "langcode"
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
