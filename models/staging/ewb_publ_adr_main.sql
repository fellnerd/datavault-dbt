/*
 * Staging Model: ewb_publ_adr_main
 *
 * Source: ext_ewb_publ_adr_main (Abacus PUBL.ADR.Main)
 * Business Key: INR (normalisiert als Integer-String für Cross-Source mit IDMS)
 * Hash Key: hk_adresse
 * Links: hk_link_adresse_person (INR, LOHNNR) → hub_person
 * Multi-Satellite: hd_person_adresse (NAME, VORNAME), hd_adresse_kontakt (ORT, PLZ, STREET)
 *
 * Hinweis: INR ist DECIMAL(38,18) in Abacus — wird auf BIGINT normalisiert damit
 * HASH("44402") == HASH("44402") auch wenn IDMS id=44402 (INT) liefert.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_publ_adr_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  inr: "CAST(CAST(INR AS BIGINT) AS NVARCHAR(MAX))"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(INR AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column: "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_adresse: "inr"
  hk_person: "LOHNNR"
  hk_link_adresse_person:
    - "inr"
    - "LOHNNR"
  hd_person_adresse:
    is_hashdiff: true
    columns:
      - "NAME"
      - "VORNAME"
  hd_adresse_kontakt:
    is_hashdiff: true
    columns:
      - "ORT"
      - "PLZ"
      - "STREET"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}