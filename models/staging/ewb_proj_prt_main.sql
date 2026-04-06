/*
 * Staging Model: ewb_proj_prt_main
 *
 * Source: ext_ewb_proj_prt_main (Abacus PROJ.PRT.Main)
 * Business Key: RECNUM (eindeutig pro Projektteil-Eintrag)
 * Hash Key: hk_projektteil (eigener Hub)
 * Link: hk_link_projektteil_projekt → hub_projekt (via PROJNR)
 * Payload: 4 Spalten — Datum, Status 1/2, User
 *
 * PRT ist eine Verlaufstabelle: 8124 Zeilen, RECNUM eindeutig,
 * PROJNR NICHT eindeutig (6292 distinct) → eigener Hub noetig.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_proj_prt_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(RECNUM AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "DATE"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_projektteil: "RECNUM"
  hk_projekt: "PROJNR"
  hk_link_projektteil_projekt:
    - "RECNUM"
    - "PROJNR"
  hd_projektteil:
    is_hashdiff: true
    columns:
      - "DATE"
      - "STAT1"
      - "STAT2"
      - "USER_F"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
