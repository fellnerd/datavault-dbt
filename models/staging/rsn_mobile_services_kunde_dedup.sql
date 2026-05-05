/*
 * Staging Dedup Model: rsn_mobile_services_kunde_dedup
 *
 * Dedupliziert rsn_mobile_services_main auf eine Zeile pro Kunde (customer_id).
 *
 * Problem: rsn_mobile_services_main hat eine Zeile pro Vertrag (vertrags_nummer).
 * Ein Kunde kann N Verträge haben → N identische Zeilen mit gleichem hk_kunde + hd_kunde.
 * automate_dv.sat() verwendet RANK() statt ROW_NUMBER() → bei gleicher ldts bekommen
 * alle N Zeilen RANK=1 → alle N Zeilen werden inserted → Duplikate in sat_kunde__compax.
 *
 * Fix: ROW_NUMBER() OVER (PARTITION BY hk_kunde, hd_kunde ORDER BY dss_load_date)
 * liefert exakt eine Zeile pro (hk_kunde, hd_kunde) Kombination an den Satelliten.
 *
 * Quelle: rsn_mobile_services_main
 * Konsument: sat_kunde__compax
 */

{{ config(materialized='view') }}

SELECT
    hk_kunde,
    hk_adresse,
    hk_link_kunde_adresse,
    hd_kunde,
    external_customer_id,
    dss_record_source,
    dss_load_date,
    dss_create_datetime,
    dss_business_key_kunde
FROM (
    SELECT
        *,
        ROW_NUMBER() OVER (
            PARTITION BY hk_kunde, hd_kunde
            ORDER BY dss_load_date
        ) AS _rn
    FROM {{ ref('rsn_mobile_services_main') }}
) t
WHERE _rn = 1
