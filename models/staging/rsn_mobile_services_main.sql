/*
 * Staging Model: rsn_mobile_services_main
 *
 * Source: ext_rsn_mobile_services_main (Compax RSN — Tägliche Stammdaten Abos & Optionen)
 * Business Keys:
 *   hk_vertrag   = Hash(vertrag_id ← vertrags_nummer)
 *   hk_kunde     = Hash(kunde_id   ← customer_id)
 *   hk_sim       = Hash(icc)
 *   hk_msisdn    = Hash(rufnummer)
 * Links:
 *   hk_link_vertrag_kunde   = Hash(vertrag_id, kunde_id)
 *   hk_link_vertrag_sim     = Hash(vertrag_id, icc)
 *   hk_link_vertrag_msisdn  = Hash(vertrag_id, rufnummer)
 * Hashdiffs:
 *   hd_kunde               → sat_kunde__compax       (external_customer_id)
 *   hd_vertrag_optionen_ma → sat_vertrag_optionen_ma__compax (aktivierungs_datum, ist_option,
 *                            kundigungs_datum, mlz_datum)
 *   hd_vertrag_eff         → sat_vertrag_eff__compax  (is_active — derived literal '1')
 *
 * Record Source override: rsn_compax (ADF-Lieferung aktuell fehlerhaft)
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_rsn_mobile_services_main"

derived_columns:
  dss_record_source: "!rsn_compax"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  vertrag_id: "vertrags_nummer"
  kunde_id: "customer_id"
  is_active: "'1'"
  dss_business_key_vertrag: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(vertrags_nummer AS NVARCHAR(MAX)))), '-1'))"
  dss_business_key_kunde: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(customer_id AS NVARCHAR(MAX)))), '-1'))"
  dss_business_key_sim: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(icc AS NVARCHAR(MAX)))), '-1'))"
  dss_business_key_msisdn: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(rufnummer AS NVARCHAR(MAX)))), '-1'))"

hashed_columns:
  hk_vertrag: "vertrag_id"
  hk_kunde: "kunde_id"
  hk_sim: "icc"
  hk_msisdn: "rufnummer"
  hk_link_vertrag_kunde:
    - "vertrag_id"
    - "kunde_id"
  hk_link_vertrag_sim:
    - "vertrag_id"
    - "icc"
  hk_link_vertrag_msisdn:
    - "vertrag_id"
    - "rufnummer"
  hd_kunde:
    is_hashdiff: true
    columns:
      - "external_customer_id"
  hd_vertrag_optionen_ma:
    is_hashdiff: true
    columns:
      - "aktivierungs_datum"
      - "ist_option"
      - "kundigungs_datum"
      - "mlz_datum"
  hd_vertrag_eff:
    is_hashdiff: true
    columns:
      - "is_active"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
