/*
 * Staging Model: rsn_mobile_cdr_main
 *
 * Source: psa_rsn_mobile_cdr_main (PSA-Tabelle — gecachte CDR Events aus ADLS)
 * Business Keys:
 *   hk_vertrag          = Hash(vertrag_id ← contract_id)
 *   hk_sim              = Hash(icc        ← iccid)
 *   hk_link_cdr_event_tl = Hash(id, vertrag_id, icc)  — Transaction Link
 *
 * Record Source: rsn_compax
 *
 * Hinweis: Source ist die PSA-Tabelle (kein External Table) — daher source_model als
 *          einfacher String ohne staging-Prefix.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model: "psa_rsn_mobile_cdr_main"

derived_columns:
  dss_record_source: "!rsn_compax"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  vertrag_id: "contract_id"
  icc: "iccid"
  dss_business_key_vertrag: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(contract_id AS NVARCHAR(MAX)))), '-1'))"
  dss_business_key_sim: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(iccid AS NVARCHAR(MAX)))), '-1'))"

hashed_columns:
  hk_vertrag: "vertrag_id"
  hk_sim: "icc"
  hk_link_cdr_event_tl:
    - "id"
    - "vertrag_id"
    - "icc"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
