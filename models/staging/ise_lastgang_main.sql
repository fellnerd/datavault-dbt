/*
 * Staging Model: ise_lastgang_main
 *
 * Source: ise_lastgang_dedup (Dedup-/Auflösungs-View auf ext_ise_lastgaenge)
 * Record Source: ewb_ise
 *
 * Business Key / Hash:
 *   hk_zeitreihe    = Hash(id_zeitreihe) → hub_zeitreihe
 *   hd_lastgang_tl__ise = Hashdiff über den Messwert → sat_lastgang_tl__ise
 *
 * Transaction Satellite (kein Multi-Active):
 *   Ein Lastgangwert ist ein FAKT, kein Zustand — Schlüssel ist
 *   (hk_zeitreihe, messzeitpunkt), der Zeitstempel ist Dependent-Child-Key.
 *   sat_lastgang_tl__ise ist append-only und vergleicht je Schlüssel genau eine
 *   Zeile, keine Mengen.
 *
 *   Der Hashdiff enthält deshalb NUR den Messwert — nicht den Zeitstempel:
 *   der ist Teil des Schlüssels, nicht des Payloads. Ein revidierter Wert am
 *   selben Zeitpunkt erzeugt so einen abweichenden Hashdiff und wird als
 *   zusätzliche Version geladen.
 *
 * Load Date: Export-Zeitstempel der einzelnen Zeile (aus ise_lastgang_dedup) —
 * damit ist je Messwert nachvollziehbar, aus welchem i-SE-Export er stammt.
 *
 * dss_source_filename / dss_run_id / dss_source_feed / dss_stage_timestamp laufen
 * als Lineage-Spalten mit, gehören aber bewusst NICHT in den Hashdiff — sonst
 * erzeugt jeder Export eine neue Version, obwohl sich der Messwert nicht ändert.
 *
 * Uses automate_dv.stage() macro for standardized staging.
 */

{{ config(tags=['ise']) }}

{%- set yaml_metadata -%}
source_model: "ise_lastgang_dedup"

derived_columns:
  dss_record_source: "!ewb_ise"
  dss_load_date: "COALESCE(TRY_CAST(dss_load_date AS DATETIME2), GETDATE())"
  dss_create_datetime: "GETDATE()"
  dss_business_key: "CONCAT_WS('||', 'default', 'default', ISNULL(LTRIM(RTRIM(CAST(id_zeitreihe AS NVARCHAR(MAX)))), '-1'))"

hashed_columns:
  hk_zeitreihe: "id_zeitreihe"
  hd_lastgang_tl__ise:
    is_hashdiff: true
    columns:
      - "wert"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
