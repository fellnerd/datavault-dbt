/*
 * Staging Model: ewb_cdr_services
 *
 * Source: ext_ewb_cdr_services (Compax RSN — CDR Services/Abos & Optionen)
 * Business Key: vertrags_nummer
 * Hash Key: hk_cdr_services
 * Payload: 9 Spalten — abo_option_name, aktivierungs_datum, customer_id,
 *          external_customer_id, icc, ist_option, kundigungs_datum, mlz_datum, rufnummer
 *
 * Record Source: ewb_compax (Compax RSN, NICHT ewb_abacus)
 * dss_load_date kommt bereits aus dem Parquet (ADF Additional Columns).
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_cdr_services"

derived_columns:
  dss_record_source: "!ewb_compax"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(vertrags_nummer AS NVARCHAR(MAX)))), '-1'))"

hashed_columns:
  hk_cdr_services: "vertrags_nummer"
  hd_cdr_services:
    is_hashdiff: true
    columns:
      - "abo_option_name"
      - "aktivierungs_datum"
      - "customer_id"
      - "external_customer_id"
      - "icc"
      - "ist_option"
      - "kundigungs_datum"
      - "mlz_datum"
      - "rufnummer"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
