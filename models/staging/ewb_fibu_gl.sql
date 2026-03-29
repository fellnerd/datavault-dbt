/*
 * Staging Model: ewb_fibu_gl
 *
 * Source: ext_ewb_fibu_gl (Abacus FIBU/GL — Folder-Scan aller Jahresscheiben E22-E26+)
 * Business Key: RECNUM (unique row identifier — DKBELEGNUMMER+KTO ist NICHT unique)
 * Hash Key: hk_hauptbuch
 * Payload: 34 Spalten — Hauptbuch-Buchungszeilen (Standard-Set)
 *
 * Note: SQL Server reserved keywords (DATE, TEXT) handled via derived_columns escape mechanism.
 *
 * BK-Entscheidung (29.3.2026): DKBELEGNUMMER+KTO hat 62% Nullen und bis zu 96 Duplikate
 * pro Kombination. RECNUM ist der einzig unique Identifier auf Zeilenebene.
 *
 * Link Hash Keys:
 *   - hk_buchungskopf:  DKBELEGNUMMER → hub_buchungskopf (FHE.RECNUM = GL.DKBELEGNUMMER)
 *   - hk_kreditor:      DKKUNDENNUMMER → hub_kreditor
 *   - hk_konto:         KTO → hub_konto (Ghost Hub)
 *   - hk_kostenstelle:  KST → hub_kostenstelle (Ghost Hub)
 *   - hk_projekt:       PROJ → hub_projekt
 *   - hk_link_hauptbuch_buchungskopf: [RECNUM, DKBELEGNUMMER]
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{%- set yaml_metadata -%}
source_model:
  staging: "ext_ewb_fibu_gl"

derived_columns:
  dss_record_source: "!ewb_abacus"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(RECNUM AS NVARCHAR(MAX)))), '-1'))"
  _escape:
    source_column:
      - "DATE"
      - "TEXT"
      - "timestamp_landing-zone"
    escape: true

hashed_columns:
  hk_hauptbuch: "RECNUM"
  hk_buchungskopf: "DKBELEGNUMMER"
  hk_kreditor: "DKKUNDENNUMMER"
  hk_konto: "KTO"
  hk_kostenstelle: "KST"
  hk_projekt: "PROJ"
  hk_link_hauptbuch_buchungskopf:
    - "RECNUM"
    - "DKBELEGNUMMER"
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
