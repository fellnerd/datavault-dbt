/*
 * Reference Table: ref_funktion_v
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_lohn_ltc_funktion (LOHN.LTC.Main.parquet, ungefiltert)
 * Primary Key: id (Funktionscode = CODE_2 aus LOHN.LEN)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * Ergänzung zu ref_abteilung_v (GROUP=1, BK=NR).
 * Diese Ref Table deckt den Funktions-Lookup ab: ma.CODE_2 = funktion.ID.
 */

{{ config(
    materialized='view'
) }}

{%- set yaml_metadata -%}
source_model: "ewb_lohn_ltc_funktion"
src_pk: "id"
src_extra_columns:
    - "description"
    - "group_nr"
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
