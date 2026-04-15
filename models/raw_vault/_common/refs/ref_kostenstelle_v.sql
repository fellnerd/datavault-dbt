/*
 * Reference Table: ref_kostenstelle
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_sp_kostenstellen (Sharepoint Finance/Kostenstellen)
 * Primary Key: KostenstelleNr (Natural Key — kein Hash Key bei Ref Tables)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 151 Kostenstellen aus dem Sharepoint-Kostenstellenplan.
 * Hierarchie: Bereich L1/L2 (alt + neu), Investitionsrechnung.
 * Join mit hub_kostenstelle über KST = KostenstelleNr.
 *
 * Developer: Daniel Fellner, MSc
 * Company:   ppmc analytics ag
 * Contact:   office@ppmcag.com
 * Version:   2026-03-30 V1.0 Initialversion (Wave 3 Sharepoint-Integration)
 */

{{ config(
    materialized='view'
) }}

{%- set yaml_metadata -%}
source_model: "ewb_sp_kostenstellen"
src_pk: "KostenstelleNr"
src_extra_columns:
    - "KostenstelleName"
    - "Kostenstelle"
    - "Bereich_L1"
    - "Bereich_L2"
    - "Bereichsname_L1"
    - "Bereichsname_L2"
    - "BereichNeu_L1"
    - "BereichNeu_L2"
    - "BereichsnameNeu_L1"
    - "BereichsnameNeu_L2"
    - "Investitionsrechnung"
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
