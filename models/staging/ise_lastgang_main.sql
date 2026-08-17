/*
 * Staging Model: ise_lastgang_main
 *
 * Source: ise_lastgang_dedup (Dedup-/Auflösungs-View auf ext_ise_lastgaenge)
 * Record Source: ewb_ise
 *
 * Business Key / Hash:
 *   hk_zeitreihe                = Hash(id_zeitreihe) → hub_zeitreihe
 *   hd_zeitreihe_lastgang_ma    = Hashdiff inkl. CDK → sat_zeitreihe_lastgang_ma__ise
 *
 * Multi-Active Satellite:
 *   Je Zeitreihe existieren viele gleichzeitig gültige Werte — einer je
 *   ¼-Stunden-Intervall. Child Dependent Key (CDK) ist damit messzeitpunkt;
 *   er gehört zwingend in den Hashdiff, sonst kollabieren alle Intervalle
 *   einer Serie auf eine Version.
 *
 * Zeitkonvention: messzeitpunkt bezeichnet das Intervall-ENDE (Wert 01.08. 00:00
 * gehört zum Juli). Bei Monatsaggregationen im Mart entsprechend abgrenzen.
 *
 * Hash-Konsistenz: hk_zeitreihe wird aus derselben INT-Spalte gebildet wie in
 * ise_zeitreihe_main — sonst greifen Hub-Load und Satellit ins Leere.
 *
 * Load Date: dss_load_date ist der Export-Zeitstempel aus dss_source_filename
 * (in ise_lastgang_dedup abgeleitet), nicht der dbt-Laufzeitpunkt. Die
 * Satellitenhistorie bildet damit den echten Datenstand ab. Revidierte Werte
 * sind über "letzter Export gewinnt" bereits im Dedup aufgelöst.
 *
 * dss_source_filename / dss_run_id / dss_source_feed laufen als Lineage-Spalten
 * mit, gehören aber bewusst NICHT in den Hashdiff — sonst erzeugt jeder Export
 * eine neue Satellitenversion, obwohl sich der Messwert nicht geändert hat.
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
  hd_zeitreihe_lastgang_ma:
    is_hashdiff: true
    columns:
      - "messzeitpunkt"
      - "wert"
{%- endset -%}

{% set metadata_dict = fromyaml(yaml_metadata) %}

{{ automate_dv.stage(include_source_columns=true,
                     source_model=metadata_dict['source_model'],
                     derived_columns=metadata_dict['derived_columns'],
                     hashed_columns=metadata_dict['hashed_columns']) }}
