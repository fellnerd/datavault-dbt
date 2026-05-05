/*
 * Staging Dedup Model: rsn_mobile_services_optionen_dedup
 *
 * Dedupliziert rsn_mobile_services_main auf eine Zeile pro (hk_vertrag, abo_option_name)
 * als Quelle für sat_vertrag_optionen_ma__compax.
 *
 * Problem: Das Merged-Parquet enthält alle historischen Tages-Snapshots. Derselbe
 * (Vertrag, Option) kann N Mal mit gleicher oder unterschiedlicher Payload erscheinen.
 * automate_dv.ma_sat() verwendet RANK() statt ROW_NUMBER() → Ties bekommen alle RANK=1
 * → alle werden inserted → Duplikate in der Vault-Tabelle.
 *
 * Fix: ROW_NUMBER() OVER (PARTITION BY hk_vertrag, abo_option_name ORDER BY dss_load_date DESC)
 * → exakt 1 Zeile pro (hk_vertrag, abo_option_name): die aktuellste Version.
 *
 * Delta-Load Hinweis: Bei inkrementellem Load (1 Datei pro Tag, 1 Zeile pro Option)
 * greift diese Dedup-Logik nicht ein (ist dann ein No-Op).
 *
 * Quelle: rsn_mobile_services_main
 * Konsument: sat_vertrag_optionen_ma__compax
 */

{{ config(materialized='view') }}

SELECT
    hk_vertrag,
    abo_option_name,
    hd_vertrag_optionen_ma,
    ist_option,
    aktivierungs_datum,
    kundigungs_datum,
    mlz_datum,
    dss_record_source,
    dss_load_date,
    dss_create_datetime
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY hk_vertrag, abo_option_name
            ORDER BY dss_load_date DESC
        ) AS _rn
    FROM {{ ref('rsn_mobile_services_main') }}
) t
WHERE _rn = 1
