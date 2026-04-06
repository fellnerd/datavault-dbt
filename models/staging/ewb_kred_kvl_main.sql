/*
 * Staging Model: ewb_kred_kvl_main
 *
 * Source: ext_ewb_kred_kvl_main (Abacus KRED.KVL.Main)
 * Business Key: DOCUMENTNR + POSITIONNR + ELEMENTTYP + INR (4-part Composite)
 * Hash Key: hk_zahlung
 * Link FK: hk_kreditorenbeleg (DOCUMENTNR → hub_kreditorenbeleg.BELNR)
 * Link: hk_link_kreditorenbeleg_zahlung [DOCUMENTNR, DOCUMENTNR+POSITIONNR+ELEMENTTYP+INR]
 * Payload: 17 Spalten — Visierungs-/Zahlungsdaten (Standard-Set)
 *
 * Note: timestamp_landing-zone handled via derived_columns escape mechanism.
 *       DOCUMENTNR = BELNR in KBL (FK), POSITIONNR = Zahlungsposition.
 *       Uniqueness verified: 283094 total = 283094 distinct(DOCUMENTNR+POSITIONNR+ELEMENTTYP+INR)
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_kred_kvl_main"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(DOCUMENTNR AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(POSITIONNR AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(ELEMENTTYP AS NVARCHAR(MAX)))), '-1'), ISNULL(LTRIM(RTRIM(CAST(INR AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column: "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_zahlung:
    - "DOCUMENTNR"
    - "POSITIONNR"
    - "ELEMENTTYP"
    - "INR"
  hk_kreditorenbeleg: "DOCUMENTNR"
  hk_link_kreditorenbeleg_zahlung:
    - "DOCUMENTNR"
    - "DOCUMENTNR"
    - "POSITIONNR"
    - "ELEMENTTYP"
    - "INR"
  hd_zahlung:
    is_hashdiff: true
    columns:
      - "ABACUS_USR_GUID"
      - "ABACUS_USR_NAME"
      - "ABGELEHNT"
      - "AKTION_DATUM_ZEIT"
      - "BEMERKUNG"
      - "BENACH_GESANDT"
      - "DATUM_ZEIT"
      - "FREIGABEBETRAG"
      - "MSGTASKSTATUS"
      - "RGPRUEFUNG"
      - "STATUSID"
      - "STVVISA"
      - "SUBDOCUMENTNR"
      - "VALIDVISUM"
      - "VER"
      - "VISIERT"
      - "VISUMSTYP"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
