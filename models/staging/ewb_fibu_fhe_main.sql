/*
 * Staging Model: ewb_fibu_fhe_main
 *
 * Source: ext_ewb_fibu_fhe_main (Abacus FIBU.FHE.Main)
 * Business Key: RECNUM
 * Hash Key: hk_buchungskopf
 * Payload: 20 Spalten — Buchungskopf-Struktur + Audit (Standard-Set)
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
      - "BOTTOM"
      - "CREDAT"
      - "CREUSER"
      - "ENTERPRISE"
      - "FONTID"
      - "GUID"
      - "ID"
      - "ID_ASCII"
      - "IDTYP_ASCII"
      - "INDENT"
      - "LEVEL"
      - "MUTDAT"
      - "MUTUSER"
      - "PLAN"
      - "REF_ID"
      - "REF_LEVEL"
      - "REF_TYP"
      - "TYP"
      - "VARIANTE"
      - "ZUONR"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
