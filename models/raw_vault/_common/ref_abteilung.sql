/*
 * Reference Table: ref_abteilung
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_lohn_ltc_main (LOHN.LTC.Main.parquet)
 * Primary Key: nr (Natural Key — kein Hash Key bei Ref Tables)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 109 Abteilungsgruppen / 2132 Einträge gesamt.
 * group_nr = 1 = eigentliche Abteilungen.
 */

{{ config(
    materialized='view'
) }}

{%- set yaml_metadata -%}
source_model: "ewb_lohn_ltc_main"
src_pk: "nr"
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
