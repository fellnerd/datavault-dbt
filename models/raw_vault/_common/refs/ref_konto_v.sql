/*
 * Reference Table: ref_konto
 *
 * Pattern: Non-historised Reference Table (Data Vault 2.1)
 * Source: ewb_sp_konten (Sharepoint Finance/Konten)
 * Primary Key: KontoNr (Natural Key — kein Hash Key bei Ref Tables)
 * Schema: vault (via dbt_project.yml _common config)
 *
 * 254 Konten aus dem Sharepoint-Kontenplan.
 * Hierarchie: L1 (Kontogruppe) → L2 (Unterkategorie) → Konto (Detail).
 * Join mit hub_konto über KTO = KontoNr.
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
source_model: "ewb_sp_konten"
src_pk: "KontoNr"
src_extra_columns:
    - "KontoName"
    - "Konto"
    - "Konto_L1"
    - "KontoName_L1"
    - "Konto_L2"
    - "KontoName_L2"
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
