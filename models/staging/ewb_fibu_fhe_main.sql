/*
 * Staging Model: ewb_fibu_fhe_main
 *
 * Source: ext_ewb_fibu_fhe_main (Abacus FIBU.FHE.Main)
 * Business Key: RECNUM
 * Hash Key: hk_buchungskopf
 * Payload: 57 Spalten — Buchungskopf-Daten
 *
 * Note: Multiple SQL Server reserved keywords (PLAN, LEVEL, BEFORE, AFTER)
 *       handled via derived_columns escape mechanism.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_fibu_fhe_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(RECNUM AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "PLAN"
      - "LEVEL"
      - "BEFORE"
      - "AFTER"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_buchungskopf: "RECNUM"
  hd_buchungskopf:
    is_hashdiff: true
    columns:
      - "AFTER"
      - "APPDAT1"
      - "APPDAT2"
      - "APPGUID1"
      - "APPGUID2"
      - "APPGUID3"
      - "APPNUM1"
      - "APPNUM2"
      - "APPNUM3"
      - "APPNUM4"
      - "APPNUM5"
      - "APPNUM6"
      - "APPSW1"
      - "APPSW10"
      - "APPSW2"
      - "APPSW3"
      - "APPSW4"
      - "APPSW5"
      - "APPSW6"
      - "APPSW7"
      - "APPSW8"
      - "APPSW9"
      - "BEFORE"
      - "BOLDSW"
      - "BOTTOM"
      - "CREDAT"
      - "CREUSER"
      - "DECIMALS"
      - "ENTERPRISE"
      - "FONTID"
      - "FORMFEED"
      - "GUID"
      - "ID"
      - "ID_ASCII"
      - "IDTYP_ASCII"
      - "INDENT"
      - "ITALICSW"
      - "LEVEL"
      - "MUTDAT"
      - "MUTUSER"
      - "NODEFAULT"
      - "NONUM"
      - "PLAN"
      - "REF_ID"
      - "REF_LEVEL"
      - "REF_TYP"
      - "SUPPRESS"
      - "SYSDAT1"
      - "SYSDAT2"
      - "SYSSW1"
      - "SYSSW2"
      - "SYSSW3"
      - "SYSSW4"
      - "TYP"
      - "ULINESW"
      - "VARIANTE"
      - "ZUONR"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
