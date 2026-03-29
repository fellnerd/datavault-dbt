/*
 * Reference Table: ref_kred_buchungsstatus
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_kred_kbs_main (KRED.KBS.Main.parquet)
 * Primary Key: STATID (Natural Key — kein Hash Key bei Ref Tables)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 7 Kreditorenstatus-Konfigurationswerte.
 * Definiert gueltige Buchungsstatus fuer Kreditorenbelege (KBL.STATID → KBS.STATID).
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2025-07-22 V1.0 Initialversion
 */

{{ config(
    materialized='view'
) }}

{%- set yaml_metadata -%}
source_model: "ewb_kred_kbs_main"
src_pk: "STATID"
src_extra_columns:
    - "STATDEF"
    - "SWINAKT"
    - "SWVORS"
    - "SWNOBLVAL"
    - "SWNOPSVAL"
    - "SWPBLDEL"
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
