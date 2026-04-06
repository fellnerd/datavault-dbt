{{ config(
    materialized='table',
    as_columnstore=false
) }}

/*
 * Staging Model: ewb_fibu_gl
 *
 * Source: psa_ewb_fibu_gl → ext_ewb_fibu_gl (Abacus FIBU/GL — Folder-Scan aller Jahresscheiben E15-E26+)
 * Business Key: RECNUM + dss_source_file_name (Composite — RECNUM ist nur INNERHALB einer Datei unique)
 * Hash Key: hk_hauptbuch
 * Payload: 34 Spalten — Hauptbuch-Buchungszeilen (Standard-Set)
 *
 * Note: SQL Server reserved keywords (DATE, TEXT) handled via derived_columns escape mechanism.
 *
 * BK-Entscheidung (5.4.2026): RECNUM allein ist NICHT global unique — 12 Jahresscheiben
 * (E15-E26) vergeben RECNUM je neu ab 1. dss_source_file_name (z.B. "E22.parquet") ist
 * als Metadataspalte verfügbar und macht RECNUM+dss_source_file_name 100% unique (944534/944534).
 *
 * Link Hash Keys:
 *   - hk_buchungskopf:  DKBELEGNUMMER → hub_buchungskopf (FHE.RECNUM = GL.DKBELEGNUMMER)
 *   - hk_kreditor:      DKKUNDENNUMMER → hub_kreditor
 *   - hk_konto:         KTO → hub_konto (Ghost Hub)
 *   - hk_kostenstelle:  KST → hub_kostenstelle (Ghost Hub)
 *   - hk_projekt:       PROJ → hub_projekt
 *   - hk_link_hauptbuch_buchungskopf:  [RECNUM, DKBELEGNUMMER]
 *   - hk_link_hauptbuch_projekt:      [RECNUM, PROJ]
 *   - hk_link_hauptbuch_kreditor:     [RECNUM, DKKUNDENNUMMER]
 *   - hk_link_hauptbuch_konto:        [RECNUM, KTO]
 *   - hk_link_hauptbuch_kostenstelle: [RECNUM, KST]
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model: "psa_ewb_fibu_gl"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(RECNUM AS NVARCHAR(MAX)))), '-1'), ISNULL(dss_source_file_name, '-1'))"
  _escape:
    source_column:
      - "DATE"
      - "TEXT"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_hauptbuch:
    - "RECNUM"
    - "dss_source_file_name"
  hk_buchungskopf: "DKBELEGNUMMER"
  hk_kreditor: "DKKUNDENNUMMER"
  hk_konto: "KTO"
  hk_kostenstelle: "KST"
  hk_projekt: "PROJ"
  hk_link_hauptbuch_buchungskopf:
    - "RECNUM"
    - "dss_source_file_name"
    - "DKBELEGNUMMER"
  hk_link_hauptbuch_projekt:
    - "RECNUM"
    - "dss_source_file_name"
    - "PROJ"
  hk_link_hauptbuch_kreditor:
    - "RECNUM"
    - "dss_source_file_name"
    - "DKKUNDENNUMMER"
  hk_link_hauptbuch_konto:
    - "RECNUM"
    - "dss_source_file_name"
    - "KTO"
  hk_link_hauptbuch_kostenstelle:
    - "RECNUM"
    - "dss_source_file_name"
    - "KST"
  hd_hauptbuch:
    is_hashdiff: true
    columns:
      - "BELNR"
      - "BETRAG"
      - "CODE"
      - "COMPANY"
      - "DATE"
      - "DIVISION"
      - "DKKUNDENNUMMER"
      - "DKPOSNUMMER"
      - "FBETR"
      - "FRW"
      - "FWAUTO"
      - "GKTO"
      - "ISO"
      - "KST"
      - "KST2"
      - "MANDANT"
      - "MWSTBETR"
      - "MWSTCODE"
      - "MWSTINCL"
      - "MWSTJAHR"
      - "MWSTKTO"
      - "MWSTLAND"
      - "MWSTMETH"
      - "MWSTMONAT"
      - "MWSTSATZ"
      - "MWSTTYP"
      - "PROJ"
      - "PROJEBENE"
      - "SAM"
      - "SAMNR"
      - "SH"
      - "TEXT"
      - "TEXT2"
      - "WAEHR"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
