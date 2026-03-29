/*
 * Staging Model: ewb_kred_kbl_main
 *
 * Source: ext_ewb_kred_kbl_main (Abacus KRED.KBL.Main)
 * Business Key: BELNR (Belegnummer)
 * Hash Key: hk_kreditorenbeleg
 * Ghost Hub: hk_kreditor (KNR)
 * Link: hk_link_kreditorenbeleg_kreditor (BELNR + KNR)
 * Payload: 116 Spalten — Kreditorenbeleg-Daten
 *
 * Note: timestamp_landing-zone handled via derived_columns escape mechanism.
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
      - "ABEA_BES_NR"
      - "ABEA_BES_RNR"
      - "ACCESSID"
      - "ADRID"
      - "APPROVALEMPLOYEENR"
      - "AUFTRAG"
      - "BEGEZRF"
      - "BEGTLNR"
      - "BELART"
      - "BELDEF"
      - "BELGRPCD1"
      - "BELGRPCD2"
      - "BELGRPCD3"
      - "BELGRPNR1"
      - "BELGRPNR2"
      - "BELGRPNR3"
      - "BELREF"
      - "BELUWRS1"
      - "BELUWRS2"
      - "BELUWTX3"
      - "BELUWTX4"
      - "BEMERK"
      - "BEWKSKF"
      - "BEWKURS"
      - "BWBTR"
      - "BWKSKF"
      - "BWKURS"
      - "BWOPBTR"
      - "BWWRC"
      - "DISGESP"
      - "DIVRES1"
      - "DIVRES2"
      - "ERFART"
      - "ERFDAT"
      - "ERFUSER"
      - "ERFZEIT"
      - "EXTAPPL"
      - "EXTBELNR"
      - "EXTGESP"
      - "EXTLFDAT"
      - "EXTLFNR"
      - "EZRFSTR"
      - "FADRID"
      - "FADRINR"
      - "FBELDAT"
      - "FRIST"
      - "FVBART"
      - "FVBARTAZ"
      - "GB"
      - "GESPERRT"
      - "GF"
      - "GFRFOLGE"
      - "GSPRES2"
      - "HILFSKST1"
      - "HILFSKST2"
      - "HILFSKTO"
      - "HILFSPROJ"
      - "ID"
      - "IGBELNR"
      - "IGLAUFNR"
      - "IGSWITCH"
      - "IMMONR"
      - "INTBWBTR"
      - "INTLWBTR"
      - "INTERCO"
      - "KBELDAT"
      - "KDINR"
      - "KDSPDAT"
      - "KID"
      - "KST1"
      - "KST2"
      - "KSTGRP"
      - "KVSSTAT"
      - "KVSNR"
      - "LETZTEZLG"
      - "LWBTR"
      - "LWOPBTR"
      - "LWWRC"
      - "MARKEDASPAID"
      - "MUTDAT"
      - "MWSABG"
      - "MWSBWBTR"
      - "MWSKORR"
      - "MWSLWBTR"
      - "MWSMETH"
      - "MWSPATYP"
      - "PROJEKT"
      - "RESBOL1"
      - "SAMK"
      - "SAMKST1"
      - "SAMKST2"
      - "SAMKTO"
      - "SAMPROJ"
      - "SAVESTATUS"
      - "SKONTO1P"
      - "SKONTO1T"
      - "SKONTO2P"
      - "SKONTO2T"
      - "SKONTO3P"
      - "SKONTO3T"
      - "STANDINGORDERID"
      - "STATDEF"
      - "STATID"
      - "SUPPLIERUNVERIFIED"
      - "TAXART"
      - "UMSK"
      - "UMSKNR"
      - "UMSORIG"
      - "URELWBTR"
      - "URELWOP"
      - "USER_F"
      - "VERBMAND"
      - "VERSION"
      - "VERTRAGID"
      - "VISSTRUCTNR"
      - "ZLGWEG"
  hd_kreditor:
    is_hashdiff: true
    columns:
      - "ADRID"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
