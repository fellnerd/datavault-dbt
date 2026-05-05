/*
 * Staging Dedup Model: rsn_mobile_services_optionen_dedup
 *
 * Dedupliziert rsn_mobile_services_main auf eine Zeile pro (hk_vertrag, abo_option_name)
 * pro Load-Batch — als Quelle für sat_vertrag_optionen_ma__compax.
 *
 * Problem: rsn_mobile_services_main hat N Zeilen pro (vertrags_nummer, abo_option_name),
 * z.B. "Xtra-Card Watch" erscheint 9× für denselben Vertrag im selben Load-Batch.
 * automate_dv.ma_sat() verwendet RANK() statt ROW_NUMBER() → bei gleicher dss_load_date
 * bekommen alle N Zeilen RANK=1 → alle N werden inserted → Duplikate.
 *
 * Fix: ROW_NUMBER() OVER (PARTITION BY hk_vertrag, abo_option_name, hd_vertrag_optionen_ma
 *                         ORDER BY dss_load_date)
 * liefert exakt eine Zeile pro (hk_vertrag, abo_option_name, hd) Kombination.
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
            PARTITION BY hk_vertrag, abo_option_name, hd_vertrag_optionen_ma
            ORDER BY dss_load_date
        ) AS _rn
    FROM {{ ref('rsn_mobile_services_main') }}
) t
WHERE _rn = 1
