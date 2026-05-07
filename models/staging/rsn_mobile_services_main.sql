/*
 * Staging Model: rsn_mobile_services_main
 *
 * Source: ext_rsn_mobile_services_main (Compax RSN — Tägliche Stammdaten Abos & Optionen)
 * Business Keys:
 *   hk_vertrag   = Hash(vertrag_id ← vertrags_nummer)
 *   hk_kunde     = Hash(kunde_id   ← customer_id)
 *   hk_sim       = Hash(icc)
 *   hk_msisdn    = Hash(rufnummer)
 *   hk_adresse   = Hash(adresse_bk ← external_customer_id normalisiert auf DECIMAL(38,18)-Format)
 * Links:
 *   hk_link_vertrag_kunde   = Hash(vertrag_id, kunde_id)
 *   hk_link_vertrag_sim     = Hash(vertrag_id, icc)
 *   hk_link_vertrag_msisdn  = Hash(vertrag_id, rufnummer)
 *   hk_link_kunde_adresse   = Hash(kunde_id, adresse_bk)
 * Hashdiffs:
 *   hd_kunde               → sat_kunde__compax       (external_customer_id)
 *   hd_vertrag_optionen_ma → sat_vertrag_optionen_ma__compax (aktivierungs_datum, ist_option,
 *                            kundigungs_datum, mlz_datum)
 *   hd_vertrag_eff         → (nicht mehr verwendet — eff_sat nutzt aktivierungs/kundigungs_datum direkt)
 *
 * adresse_bk: CAST(TRY_CAST(external_customer_id AS DECIMAL(38,18)) AS NVARCHAR(MAX))
 *   → normalisiert '13761' zu '13761.000000000000000000' für Hash-Kompatibilität mit hub_adresse (INR)
 *   → CXL_-Prefix (stornierte Kunden) wird bereinigt: CXL_49459 → 49459 → DECIMAL-Format
 *   → NULL/nicht-castbare Werte ergeben NULL → automate_dv null_placeholder = '-1' → kein Link-Record
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
  dss_eff_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  vertrag_id: "vertrags_nummer"
  kunde_id: "customer_id"
  is_active: "'1'"
  dss_business_key_vertrag: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(vertrags_nummer AS NVARCHAR(MAX)))), '-1'))"
  dss_business_key_kunde: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(customer_id AS NVARCHAR(MAX)))), '-1'))"
  dss_business_key_sim: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(icc AS NVARCHAR(MAX)))), '-1'))"
  dss_business_key_msisdn: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(rufnummer AS NVARCHAR(MAX)))), '-1'))"
  adresse_bk: "CAST(TRY_CAST(CASE WHEN external_customer_id LIKE 'CXL_%' THEN SUBSTRING(external_customer_id, 5, LEN(external_customer_id)) ELSE external_customer_id END AS DECIMAL(38,18)) AS NVARCHAR(MAX))"

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
  hk_adresse: "adresse_bk"
  hk_link_kunde_adresse:
    - "kunde_id"
    - "adresse_bk"
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
