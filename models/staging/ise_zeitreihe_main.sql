/*
 * Staging Model: ise_zeitreihe_main
 *
 * Source: ise_zeitreihe_dedup (Dedup-/Typisierungs-View auf ext_ise_stammdaten)
 * Record Source: ewb_ise
 *
 * Business Keys:
 *   hk_zeitreihe             = Hash(id_zeitreihe)        → hub_zeitreihe
 *   hk_zeitreihegruppe       = Hash(id_zeitreihegruppe)  → hub_zeitreihegruppe
 *   hk_link_zeitreihe_gruppe = Hash(id_zeitreihe, id_zeitreihegruppe)
 *                                                        → link_zeitreihe_gruppe
 *
 * Hashdiff-Split:
 *   hd_zeitreihe__ise    — Eigenschaften der Zeitreihe selbst (Typ, Einheit,
 *                          Zeitschritt, Referenz, Standort, Gültigkeit)
 *   hd_zeitreihe_gruppe  — Eigenschaften der Gruppenzugehörigkeit (Reihenfolge,
 *                          Gültigkeit der Zuordnung) → Satellit am Link
 *
 * Wichtig — Hash-Konsistenz mit ise_lastgang_main:
 *   hk_zeitreihe wird dort aus derselben Spalte id_zeitreihe (INT) gebildet.
 *   Der Cast auf INT muss in beiden Pfaden erhalten bleiben, sonst hashen
 *   '145089' und '145089.0' unterschiedlich.
 *
 * Hinweis zur Quellbenennung: zeitreihe_typ entspricht der Exportspalte
 * "Zeitreihe", die den Typnamen enthält (Techanl.ZEITREIHETYP.Bezeichnung) —
 * nicht den Seriennamen. Details in ise_zeitreihe_dedup.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{{ config(tags=['ise']) }}

{%- set yaml_metadata -%}
source_model: "ise_zeitreihe_dedup"

derived_columns:
  dss_record_source: "!ewb_ise"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(id_zeitreihe AS NVARCHAR(MAX)))), '-1'))"

hashed_columns:
  hk_zeitreihe: "id_zeitreihe"
  hk_zeitreihegruppe: "id_zeitreihegruppe"
  hk_link_zeitreihe_gruppe:
    - "id_zeitreihe"
    - "id_zeitreihegruppe"
  hd_zeitreihe__ise:
    is_hashdiff: true
    columns:
      - "bezuegeranlage"
      - "einheit"
      - "energieart"
      - "id_zeitreihe_typ"
      - "referenz"
      - "referenz_id"
      - "referenz_typ"
      - "standort"
      - "zeitreihe_gueltig_bis"
      - "zeitreihe_gueltig_von"
      - "zeitreihe_key"
      - "zeitreihe_typ"
      - "zeitschritt_min"
  hd_zeitreihe_gruppe:
    is_hashdiff: true
    columns:
      - "gruppe_gueltig_bis"
      - "gruppe_gueltig_von"
      - "reihenfolge"
      - "zeitreihegruppe"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
