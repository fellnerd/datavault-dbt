/*
 * Staging Model: ewb_kred_kbs_main
 *
 * Source: ext_ewb_kred_kbs_main (Abacus KRED.KBS.Main)
 * Business Key: STATID (Status-ID)
 * Hash Key: hk_kred_buchungsstatus
 * Hash Diff: hd_kred_buchungsstatus
 * Payload: 7 Spalten — Kreditorenstatus-Konfiguration
 *
 * KBS ist eine Status-Konfigurationstabelle mit nur 7 stabilen Eintraegen.
 * Ziel: ref_kred_buchungsstatus (Reference Table, kein Hub/Satellite).
 *
 * Note: timestamp_landing-zone handled via derived_columns escape mechanism.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_kred_kbs_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(STATID AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column: "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_kred_buchungsstatus: "STATID"
  hd_kred_buchungsstatus:
    is_hashdiff: true
    columns:
      - "STATDEF"
      - "SWINAKT"
      - "SWNOBLVAL"
      - "SWNOPSVAL"
      - "SWPBLDEL"
      - "SWVORS"
      - "VERSION"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
