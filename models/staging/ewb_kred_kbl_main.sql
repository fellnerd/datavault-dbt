/*
 * Staging Model: ewb_kred_kbl_main
 *
 * Source: ext_ewb_kred_kbl_main (Abacus KRED.KBL.Main — Kreditorenbelege)
 * Business Key: BELNR (Belegnummer)
 * Hash Key: hk_kreditorenbeleg
 *
 * Vault Objects:
 *   - hub_kreditorenbeleg (BK: BELNR)
 *   - hub_kreditor (Ghost Hub, BK: KNR)
 *   - link_kreditorenbeleg_kreditor (BELNR + KNR)
 *   - sat_kreditorenbeleg__abacus (32 Payload-Spalten)
 *   - sat_kreditor__abacus (2 Payload-Spalten: ADRID, FADRINR)
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_kred_kbl_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(BELNR AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column: "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_kreditorenbeleg: "BELNR"
  hk_kreditor: "KNR"
  hk_link_kreditorenbeleg_kreditor:
    - "BELNR"
    - "KNR"
  hd_kreditorenbeleg:
    is_hashdiff: true
    columns:
      - "BELART"
      - "BELDEF"
      - "BELREF"
      - "BWBTR"
      - "BWOPBTR"
      - "BWWRC"
      - "ERFDAT"
      - "ERFUSER"
      - "FBELDAT"
      - "FRIST"
      - "GESPERRT"
      - "KBELDAT"
      - "KDSPDAT"
      - "KST1"
      - "KST2"
      - "LETZTEZLG"
      - "LWBTR"
      - "LWOPBTR"
      - "LWWRC"
      - "MUTDAT"
      - "MWSBWBTR"
      - "MWSLWBTR"
      - "PROJEKT"
      - "SKONTO1P"
      - "SKONTO1T"
      - "SKONTO2P"
      - "SKONTO2T"
      - "SKONTO3P"
      - "SKONTO3T"
      - "STATDEF"
      - "STATID"
      - "USER_F"
      - "ZLGWEG"
  hd_kreditor:
    is_hashdiff: true
    columns:
      - "ADRID"
      - "FADRINR"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
